import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const VAULT_FILE = path.resolve(process.cwd(), '.titan-vault.enc.json');
const VAULT_KEY_FILE = path.resolve(process.cwd(), '.titan-vault.key');

interface EncryptedPayload {
  iv: string;
  tag: string;
  data: string;
}

const ENV_FALLBACK_MAP: Record<string, string> = {
  render: 'RENDER_API_KEY',
  vercel: 'VERCEL_TOKEN',
  netlify: 'NETLIFY_TOKEN',
  railway: 'RAILWAY_TOKEN',
  cloudflare: 'CLOUDFLARE_API_TOKEN',
  github: 'GITHUB_TOKEN',
};

function getEncryptionKey(): Buffer {
  let rawSecret = process.env.TITAN_VAULT_SECRET || '';
  if (!rawSecret) {
    if (fs.existsSync(VAULT_KEY_FILE)) {
      rawSecret = fs.readFileSync(VAULT_KEY_FILE, 'utf-8').trim();
    } else {
      rawSecret = crypto.randomBytes(32).toString('hex');
      try {
        fs.writeFileSync(VAULT_KEY_FILE, rawSecret, { mode: 0o600 });
      } catch {
        // Fallback to ephemeral process secret if FS is read-only
      }
    }
  }
  return crypto.scryptSync(rawSecret, 'titan-code-vault-2026', 32);
}

function readVaultMap(): Record<string, string> {
  try {
    if (!fs.existsSync(VAULT_FILE)) return {};
    const raw = JSON.parse(fs.readFileSync(VAULT_FILE, 'utf-8')) as EncryptedPayload;
    if (!raw.iv || !raw.tag || !raw.data) return {};
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(raw.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(raw.tag, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(raw.data, 'hex')),
      decipher.final(),
    ]);
    const parsed = JSON.parse(decrypted.toString('utf-8')) as Record<string, string>;
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function writeVaultMap(map: Record<string, string>): void {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encoded = Buffer.concat([
    cipher.update(JSON.stringify(map), 'utf-8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const payload: EncryptedPayload = {
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: encoded.toString('hex'),
  };
  fs.writeFileSync(VAULT_FILE, JSON.stringify(payload, null, 2), { mode: 0o600 });
}

export function getVaultSecret(slot: string): string | null {
  const envVar = ENV_FALLBACK_MAP[slot];
  if (envVar && process.env[envVar] && process.env[envVar]!.trim().length > 0) {
    return process.env[envVar]!.trim();
  }
  const map = readVaultMap();
  const val = map[slot];
  return val && val.trim().length > 0 ? val.trim() : null;
}

export function hasVaultSecret(slot: string): boolean {
  return getVaultSecret(slot) !== null;
}

export function setVaultSecret(slot: string, value: string): void {
  if (slot === 'gemini') {
    throw new Error('GEMINI_API_KEY é gerenciada exclusivamente via Secrets/ambiente do servidor.');
  }
  const clean = value.trim();
  if (!clean) {
    deleteVaultSecret(slot);
    return;
  }
  const map = readVaultMap();
  map[slot] = clean;
  writeVaultMap(map);
}

export function deleteVaultSecret(slot: string): void {
  const map = readVaultMap();
  delete map[slot];
  writeVaultMap(map);
}

export function getVaultMaskedStatus(): Array<{
  slot: string;
  source: 'env' | 'vault' | 'none';
  configured: boolean;
}> {
  const slots = Object.keys(ENV_FALLBACK_MAP);
  const map = readVaultMap();
  return slots.map((slot) => {
    const envVar = ENV_FALLBACK_MAP[slot];
    const fromEnv = Boolean(envVar && process.env[envVar] && process.env[envVar]!.trim().length > 0);
    const fromVault = Boolean(map[slot] && map[slot].trim().length > 0);
    return {
      slot,
      source: fromEnv ? 'env' : fromVault ? 'vault' : 'none',
      configured: fromEnv || fromVault,
    };
  });
}
