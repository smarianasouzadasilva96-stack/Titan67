import { Download, GitBranch, GitCommit, GitPullRequest, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTitan } from '../contexts/TitanContext.tsx';
import {
  cloneGithubRepository,
  createGitSnapshot,
  fetchGithubRepos,
  fetchGitStatus,
  inspectGithubRepo,
} from '../lib/titanApi.ts';
import { saveProjectToWorkspace, writeAuditLog } from '../lib/workspaceService.ts';
import type { GitRepoStatus } from '../shared/titanTypes.ts';

export function GitControlModule() {
  const { user, projects, selectedProjectId, selectedProjectFiles, notify } = useTitan();
  const [gitStatus, setGitStatus] = useState<GitRepoStatus | null>(null);
  const [repos, setRepos] = useState<Array<{
    id: number;
    fullName: string;
    private: boolean;
    defaultBranch: string;
    htmlUrl: string;
    updatedAt: string;
  }>>([]);
  const [ownerRepoInput, setOwnerRepoInput] = useState('');
  const [branchInput, setBranchInput] = useState('main');
  const [repoDetails, setRepoDetails] = useState<{
    commits: Array<{ sha: string; message: string; author: string; date: string }>;
    branches: string[];
    pulls: Array<{ number: number; title: string; state: string; author: string }>;
  } | null>(null);
  const [commitMsg, setCommitMsg] = useState('feat: update via TITAN CODE');
  const [snapshotOutput, setSnapshotOutput] = useState<{
    commitHash: string;
    branch: string;
    diffStat: string;
    logOutput: string;
  } | null>(null);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const st = await fetchGitStatus();
      setGitStatus(st);
      if (st.githubConnected) {
        const list = await fetchGithubRepos();
        setRepos(list.repos);
      }
    } catch {
      // Ignore silent git status fail
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const handleInspectRepo = async (repoName?: string) => {
    const target = (repoName || ownerRepoInput).trim();
    if (!target) {
      notify('warning', 'Informe o repositório', 'Use formato owner/repo.');
      return;
    }
    setOwnerRepoInput(target);
    setLoading(true);
    try {
      const details = await inspectGithubRepo(target);
      setRepoDetails(details);
      if (details.branches[0]) setBranchInput(details.branches[0]);
      notify('success', 'Repositório inspecionado', `${details.commits.length} commits recentes carregados.`);
    } catch (err) {
      notify('error', 'Erro ao inspecionar', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCloneToWorkspace = async () => {
    if (!user || !ownerRepoInput.trim()) return;
    if (!confirmOverwrite) {
      setConfirmOverwrite(true);
      notify('warning', 'Confirmação necessária', 'Clique novamente em Clonar para importar o repositório no Workspace.');
      return;
    }
    setConfirmOverwrite(false);
    setLoading(true);
    try {
      const res = await cloneGithubRepository(ownerRepoInput.trim(), branchInput || 'main');
      await saveProjectToWorkspace({
        ownerId: user.uid,
        name: ownerRepoInput.trim().split('/')[1] || ownerRepoInput.trim(),
        description: `Clonado do GitHub (${ownerRepoInput.trim()} @ ${branchInput})`,
        projectType: 'fullstack',
        language: res.files[0]?.language || 'TypeScript',
        environment: 'Git Clone',
        status: 'COMPLETED',
        files: res.files,
      });
      await writeAuditLog({
        actorId: user.uid,
        module: 'git-control',
        action: 'github_clone_workspace',
        severity: 'info',
        detail: `Clonado ${ownerRepoInput.trim()} (${res.files.length} arquivos) para Workspace.`,
      });
      notify('success', 'Repositório clonado', `${res.files.length} arquivos importados para o Workspace.`);
    } catch (err) {
      notify('error', 'Falha no clone', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSnapshot = async () => {
    const proj = projects.find((p) => p.id === selectedProjectId);
    if (!proj || selectedProjectFiles.length === 0) {
      notify('warning', 'Sem projeto ativo', 'Selecione um projeto no Workspace para gerar snapshot Git.');
      return;
    }
    setLoading(true);
    try {
      const snap = await createGitSnapshot({
        files: selectedProjectFiles.map((f) => ({ path: f.path, content: f.content, language: f.language })),
        commitMessage: commitMsg,
        branchName: branchInput || 'main',
      });
      setSnapshotOutput(snap);
      notify('success', `Snapshot Git ${snap.commitHash}`, `Commit gerado na branch ${snap.branch}.`);
    } catch (err) {
      notify('error', 'Erro no snapshot Git', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white tracking-tight">
            TITAN Git & Version Control
          </h1>
          <p className="text-sm text-zinc-400">
            Git CLI real, inspeção de commits/branches/PRs no GitHub, snapshot de diff e importação de repositórios para o Workspace.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadStatus()}
          className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-medium rounded-lg flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Atualizar Status</span>
        </button>
      </div>

      {/* Git Status */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-4 space-y-1">
          <div className="text-xs text-zinc-400">Git CLI Servidor</div>
          <div className="font-mono text-sm font-semibold text-white">
            {gitStatus?.gitInstalled ? gitStatus.gitVersion : 'Não instalado'}
          </div>
        </div>
        <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-4 space-y-1">
          <div className="text-xs text-zinc-400">GitHub Integration</div>
          <div className="font-mono text-sm font-semibold text-white">
            {gitStatus?.githubConnected ? `@${gitStatus.githubUser}` : 'Token não configurado (repositórios públicos disponíveis)'}
          </div>
        </div>
        <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-4 space-y-1">
          <div className="text-xs text-zinc-400">Snapshot Git do Projeto Ativo</div>
          <div className="flex gap-2 mt-1">
            <input
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              className="flex-1 bg-[#09090D] border border-zinc-800 rounded px-2 py-1 text-xs text-white"
            />
            <button
              type="button"
              onClick={() => void handleCreateSnapshot()}
              disabled={loading}
              className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded cursor-pointer"
            >
              Commit
            </button>
          </div>
        </div>
      </div>

      {snapshotOutput && (
        <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-4 space-y-2">
          <div className="text-xs font-semibold text-emerald-400">
            Snapshot Git Real Gerado ({snapshotOutput.branch} · {snapshotOutput.commitHash})
          </div>
          <pre className="bg-[#09090D] border border-zinc-800 rounded-lg p-3 text-xs font-mono text-zinc-300 overflow-x-auto">
            {snapshotOutput.diffStat}
          </pre>
        </div>
      )}

      {/* GitHub Explorer & Clone */}
      <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={ownerRepoInput}
            onChange={(e) => {
              setOwnerRepoInput(e.target.value);
              setConfirmOverwrite(false);
            }}
            placeholder="owner/repo (ex: facebook/react)"
            className="flex-1 bg-[#09090D] border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-white"
          />
          <input
            value={branchInput}
            onChange={(e) => setBranchInput(e.target.value)}
            placeholder="branch (main)"
            className="sm:w-36 bg-[#09090D] border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-white"
          />
          <button
            type="button"
            onClick={() => void handleInspectRepo()}
            disabled={loading}
            className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs text-white rounded-lg cursor-pointer"
          >
            Inspecionar
          </button>
          <button
            type="button"
            onClick={() => void handleCloneToWorkspace()}
            disabled={loading || !ownerRepoInput.trim()}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-xs text-white font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{confirmOverwrite ? 'Confirmar Clone' : 'Clonar para Workspace'}</span>
          </button>
        </div>

        {repos.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {repos.slice(0, 8).map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => void handleInspectRepo(r.fullName)}
                className="px-2.5 py-1 bg-[#09090D] hover:bg-zinc-900 border border-zinc-800 rounded text-xs font-mono text-zinc-300 cursor-pointer"
              >
                {r.fullName}
              </button>
            ))}
          </div>
        )}

        {repoDetails && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
            <div className="space-y-2">
              <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                <GitCommit className="w-3.5 h-3.5 text-red-500" />
                <span>Commits Recentes</span>
              </div>
              <div className="space-y-1.5">
                {repoDetails.commits.map((c) => (
                  <div key={c.sha} className="p-2.5 rounded bg-[#09090D] border border-zinc-800 text-xs">
                    <span className="font-mono text-red-400 mr-2">{c.sha}</span>
                    <span className="text-zinc-200">{c.message}</span>
                    <div className="text-[11px] text-zinc-500 mt-0.5">{c.author}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <div className="text-xs font-semibold text-white flex items-center gap-1.5 mb-2">
                  <GitBranch className="w-3.5 h-3.5 text-red-500" />
                  <span>Branches ({repoDetails.branches.length})</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {repoDetails.branches.map((b) => (
                    <span key={b} className="px-2 py-1 bg-[#09090D] border border-zinc-800 rounded text-xs font-mono text-zinc-300">
                      {b}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-white flex items-center gap-1.5 mb-2">
                  <GitPullRequest className="w-3.5 h-3.5 text-red-500" />
                  <span>Pull Requests Abertos ({repoDetails.pulls.length})</span>
                </div>
                {repoDetails.pulls.length === 0 ? (
                  <p className="text-xs text-zinc-500">Nenhum PR aberto.</p>
                ) : (
                  <div className="space-y-1.5">
                    {repoDetails.pulls.map((pr) => (
                      <div key={pr.number} className="p-2 rounded bg-[#09090D] border border-zinc-800 text-xs text-zinc-300">
                        #{pr.number} {pr.title} ({pr.author})
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
