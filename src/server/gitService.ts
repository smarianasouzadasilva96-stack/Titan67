import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import type { GeneratedFileItem, GitRepoStatus } from '../shared/titanTypes.ts';
import { getVaultSecret } from './vaultService.ts';

const execFileAsync = promisify(execFile);

export async function getGitEnvironmentStatus(): Promise<GitRepoStatus> {
  let gitInstalled = false;
  let gitVersion: string | null = null;
  let workspaceInitialized = false;
  let branch: string | null = null;
  let lastCommit: string | null = null;

  try {
    const { stdout } = await execFileAsync('git', ['--version'], { timeout: 2500 });
    gitInstalled = true;
    gitVersion = stdout.trim();
  } catch {
    gitInstalled = false;
  }

  if (gitInstalled && fs.existsSync(path.resolve(process.cwd(), '.git'))) {
    workspaceInitialized = true;
    try {
      const b = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { timeout: 2000 });
      branch = b.stdout.trim();
    } catch {
      branch = null;
    }
    try {
      const c = await execFileAsync('git', ['log', '-1', '--oneline'], { timeout: 2000 });
      lastCommit = c.stdout.trim();
    } catch {
      lastCommit = null;
    }
  }

  const ghToken = getVaultSecret('github');
  let githubConnected = false;
  let githubUser: string | undefined;

  if (ghToken) {
    try {
      const resp = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${ghToken}`,
          'User-Agent': 'TITAN-CODE-GitControl',
          Accept: 'application/vnd.github+json',
        },
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        const user = (await resp.json()) as { login?: string };
        githubConnected = true;
        githubUser = user.login;
      }
    } catch {
      githubConnected = false;
    }
  }

  return {
    gitInstalled,
    gitVersion,
    workspaceInitialized,
    branch,
    lastCommit,
    githubConnected,
    githubUser,
  };
}

export async function listGithubRepositories(): Promise<Array<{
  id: number;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  htmlUrl: string;
  updatedAt: string;
}>> {
  const ghToken = getVaultSecret('github');
  if (!ghToken) {
    throw new Error('Token do GitHub não configurado no Cofre de Integrações.');
  }
  const resp = await fetch('https://api.github.com/user/repos?sort=updated&per_page=20', {
    headers: {
      Authorization: `Bearer ${ghToken}`,
      'User-Agent': 'TITAN-CODE-GitControl',
      Accept: 'application/vnd.github+json',
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) {
    throw new Error(`GitHub API retornou HTTP ${resp.status}`);
  }
  const data = (await resp.json()) as Array<{
    id: number;
    full_name: string;
    private: boolean;
    default_branch: string;
    html_url: string;
    updated_at: string;
  }>;
  return data.map((r) => ({
    id: r.id,
    fullName: r.full_name,
    private: r.private,
    defaultBranch: r.default_branch,
    htmlUrl: r.html_url,
    updatedAt: r.updated_at,
  }));
}

export async function inspectGithubRepoDetails(ownerRepo: string): Promise<{
  commits: Array<{ sha: string; message: string; author: string; date: string }>;
  branches: string[];
  pulls: Array<{ number: number; title: string; state: string; author: string }>;
}> {
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(ownerRepo)) {
    throw new Error('Nome de repositório inválido. Use formato owner/repo.');
  }
  const ghToken = getVaultSecret('github');
  const headers: Record<string, string> = {
    'User-Agent': 'TITAN-CODE-GitControl',
    Accept: 'application/vnd.github+json',
  };
  if (ghToken) headers.Authorization = `Bearer ${ghToken}`;

  const [cResp, bResp, pResp] = await Promise.all([
    fetch(`https://api.github.com/repos/${ownerRepo}/commits?per_page=10`, { headers, signal: AbortSignal.timeout(7000) }),
    fetch(`https://api.github.com/repos/${ownerRepo}/branches?per_page=15`, { headers, signal: AbortSignal.timeout(7000) }),
    fetch(`https://api.github.com/repos/${ownerRepo}/pulls?state=open&per_page=10`, { headers, signal: AbortSignal.timeout(7000) }),
  ]);

  if (!cResp.ok) {
    throw new Error(`Falha ao acessar repositório ${ownerRepo} (HTTP ${cResp.status}).`);
  }

  const rawCommits = (await cResp.json()) as Array<{
    sha: string;
    commit: { message: string; author: { name: string; date: string } };
  }>;
  const rawBranches = bResp.ok ? ((await bResp.json()) as Array<{ name: string }>) : [];
  const rawPulls = pResp.ok
    ? ((await pResp.json()) as Array<{ number: number; title: string; state: string; user?: { login?: string } }>)
    : [];

  return {
    commits: rawCommits.map((c) => ({
      sha: c.sha.slice(0, 7),
      message: c.commit.message.split('\n')[0],
      author: c.commit.author.name,
      date: c.commit.author.date,
    })),
    branches: rawBranches.map((b) => b.name),
    pulls: rawPulls.map((p) => ({
      number: p.number,
      title: p.title,
      state: p.state,
      author: p.user?.login || 'unknown',
    })),
  };
}

export async function runSandboxGitSnapshot(params: {
  files: Array<{ path: string; content: string; language: string }>;
  commitMessage: string;
  branchName?: string;
}): Promise<{
  commitHash: string;
  branch: string;
  diffStat: string;
  logOutput: string;
}> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'titan-git-'));
  try {
    await execFileAsync('git', ['init'], { cwd: tempDir });
    await execFileAsync('git', ['config', 'user.name', 'TITAN CODE'], { cwd: tempDir });
    await execFileAsync('git', ['config', 'user.email', 'titan@titancode.local'], { cwd: tempDir });

    const branch = (params.branchName || 'main').replace(/[^a-zA-Z0-9._/-]/g, '-');
    await execFileAsync('git', ['checkout', '-B', branch], { cwd: tempDir });

    for (const file of params.files.slice(0, 60)) {
      const cleanRel = file.path.replace(/^\/+/, '').replace(/\.\.\//g, '');
      if (!cleanRel) continue;
      const target = path.join(tempDir, cleanRel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, file.content, 'utf-8');
    }

    await execFileAsync('git', ['add', '-A'], { cwd: tempDir });
    await execFileAsync('git', ['commit', '-m', params.commitMessage.slice(0, 200) || 'chore: snapshot'], {
      cwd: tempDir,
    });
    const hashRes = await execFileAsync('git', ['rev-parse', '--short', 'HEAD'], { cwd: tempDir });
    const statRes = await execFileAsync('git', ['show', '--stat', '--oneline', 'HEAD'], { cwd: tempDir });
    const logRes = await execFileAsync('git', ['log', '-n', '5', '--oneline'], { cwd: tempDir });

    return {
      commitHash: hashRes.stdout.trim(),
      branch,
      diffStat: statRes.stdout.trim(),
      logOutput: logRes.stdout.trim(),
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

export async function cloneGithubFilesToProject(ownerRepo: string, branch = 'main'): Promise<GeneratedFileItem[]> {
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(ownerRepo)) {
    throw new Error('Use o formato owner/repo (ex: vercel/next.js).');
  }
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'titan-clone-'));
  try {
    const ghToken = getVaultSecret('github');
    const url = ghToken
      ? `https://x-access-token:${ghToken}@github.com/${ownerRepo}.git`
      : `https://github.com/${ownerRepo}.git`;

    await execFileAsync('git', ['clone', '--depth', '1', '--branch', branch, url, tempDir], {
      timeout: 15000,
    });

    const collected: GeneratedFileItem[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (collected.length < 40) {
          const stat = fs.statSync(full);
          if (stat.size <= 150_000) {
            const rel = path.relative(tempDir, full).replace(/\\/g, '/');
            collected.push({
              path: rel,
              content: fs.readFileSync(full, 'utf-8'),
              language: inferLangFromExt(rel),
              fileKind: rel.toLowerCase().endsWith('.md') ? 'Doc' : rel.endsWith('.json') ? 'Config' : 'Source',
            });
          }
        }
      }
    };
    walk(tempDir);
    return collected;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function inferLangFromExt(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    ts: 'TypeScript',
    tsx: 'TSX',
    js: 'JavaScript',
    jsx: 'JSX',
    py: 'Python',
    luau: 'Luau',
    lua: 'Lua',
    kt: 'Kotlin',
    java: 'Java',
    html: 'HTML',
    css: 'CSS',
    json: 'JSON',
    yml: 'YAML',
    yaml: 'YAML',
    md: 'Markdown',
    sh: 'Bash',
    sql: 'SQL',
  };
  return map[ext] || 'TypeScript';
}
