import type { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export interface AuthenticatedUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  isAdmin: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

const ADMIN_EMAILS = new Set(['tzudogamer@gmail.com']);

let cachedProjectId: string | null = null;

export function getFirebaseProjectId(): string | null {
  if (cachedProjectId) return cachedProjectId;
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (!fs.existsSync(configPath)) return null;
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as { projectId?: string };
    cachedProjectId = parsed.projectId || null;
    return cachedProjectId;
  } catch {
    return null;
  }
}

const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
);

export async function verifyFirebaseAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token de autenticação ausente. Faça login com sua conta Google.' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  const projectId = getFirebaseProjectId();
  if (!projectId) {
    res.status(500).json({ error: 'Configuração do projeto Firebase não encontrada no servidor.' });
    return;
  }

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });

    const uid = typeof payload.sub === 'string' ? payload.sub : '';
    const email = typeof payload.email === 'string' ? payload.email : '';
    const emailVerified = payload.email_verified === true;
    const name = typeof payload.name === 'string' ? payload.name : undefined;

    if (!uid) {
      res.status(401).json({ error: 'Token inválido: identificador de usuário ausente.' });
      return;
    }

    req.user = {
      uid,
      email,
      emailVerified,
      name,
      isAdmin: emailVerified && ADMIN_EMAILS.has(email.toLowerCase()),
    };
    next();
  } catch (err) {
    res.status(401).json({
      error: 'Sessão inválida ou expirada.',
      detail: err instanceof Error ? err.message : 'JWT verification failed',
    });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || !req.user.isAdmin) {
    res.status(403).json({
      error: 'Acesso negado: privilégios de administrador verificados são obrigatórios.',
    });
    return;
  }
  next();
}

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function createRateLimiter(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.user?.uid || req.ip || 'anonymous';
    const now = Date.now();
    const existing = rateBuckets.get(key);

    if (!existing || now > existing.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (existing.count >= maxRequests) {
      res.status(429).json({
        error: 'Limite de requisições atingido. Aguarde alguns segundos antes de tentar novamente.',
      });
      return;
    }

    existing.count += 1;
    next();
  };
}
