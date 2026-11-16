import { collection, getDocs } from 'firebase/firestore';
import { Activity, Loader2, Play, Plus, RefreshCw, Trash2 } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTitan } from '../contexts/TitanContext.tsx';
import { db } from '../lib/firebase.ts';
import { analyzeCode, cancelQueuedJob, executeInSandbox, fetchQueueJobs } from '../lib/titanApi.ts';
import {
  createAutomationJob,
  createProjectBackup,
  deleteAutomationJob,
  updateAutomationRun,
  writeAuditLog,
} from '../lib/workspaceService.ts';
import type { AutomationJobDoc, ProjectFileDoc, QueueJob } from '../shared/titanTypes.ts';
import { validateCodeCompleteness, validateSyntaxStatic } from '../shared/titanValidators.ts';

export function AutomationsModule() {
  const { user, projects, automations, notify } = useTitan();
  const [name, setName] = useState('Auditoria & Backup Automático');
  const [actionType, setActionType] = useState<AutomationJobDoc['actionType']>('static-analysis');
  const [targetProjectId, setTargetProjectId] = useState<string>('');
  const [runningId, setRunningId] = useState<string | null>(null);
  const [queueJobs, setQueueJobs] = useState<QueueJob[]>([]);

  const loadQueue = useCallback(async () => {
    try {
      const res = await fetchQueueJobs();
      setQueueJobs(res.jobs);
    } catch {
      // Ignore silent fail
    }
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !name.trim()) return;
    await createAutomationJob({
      ownerId: user.uid,
      name: name.trim(),
      actionType,
      targetProjectId: targetProjectId || projects[0]?.id,
    });
    notify('success', 'Automação criada', name.trim());
  };

  const handleRunJob = async (job: AutomationJobDoc) => {
    if (!user) return;
    const projId = job.targetProjectId || projects[0]?.id;
    const projObj = projects.find((p) => p.id === projId);
    if (!projId || !projObj) {
      notify('warning', 'Sem projeto alvo', 'Crie ou salve um projeto no Workspace para executar a automação.');
      return;
    }

    setRunningId(job.id);
    try {
      await updateAutomationRun({
        jobId: job.id,
        status: 'RUNNING',
        lastRunSummary: 'Executando verificação nos arquivos do projeto...',
        runCount: job.runCount,
      });

      const snap = await getDocs(collection(db, 'projects', projId, 'files'));
      const files = snap.docs.map((d) => d.data() as ProjectFileDoc);
      if (files.length === 0) {
        await updateAutomationRun({
          jobId: job.id,
          status: 'FAILED',
          lastRunSummary: 'Projeto alvo não possui arquivos.',
          runCount: job.runCount + 1,
        });
        return;
      }

      let summary = '';
      if (job.actionType === 'backup-sync') {
        const bkp = await createProjectBackup({
          ownerId: user.uid,
          projectId: projObj.id,
          projectName: projObj.name,
          label: `Auto-Sync (${job.name})`,
          files: files.map((f) => ({
            path: f.path,
            content: f.content,
            language: f.language,
            fileKind: f.fileKind,
          })),
        });
        summary = `Backup SHA-256 gerado: ${bkp.backupId} (${files.length} arquivos).`;
      } else if (job.actionType === 'static-analysis' || job.actionType === 'security-scan') {
        const analysis = await analyzeCode({
          code: files.map((f) => `// ${f.path}\n${f.content}`).join('\n\n'),
          language: files[0].language,
          useAi: job.actionType === 'security-scan',
        });
        summary = `${files.length} arquivo(s) analisado(s). Apontamentos: ${analysis.staticIssues.length}. Segurança: ${analysis.securityFindings.length}.`;
      } else if (job.actionType === 'test-suite') {
        const exec = await executeInSandbox({
          language: files[0].language,
          code: files[0].content,
          syntaxOnly: true,
        });
        summary = `Sandbox (${exec.runtime}): syntaxValid=${String(exec.syntaxValid)} · ${exec.stdout || exec.stderr || exec.limitationReason || 'OK'}`;
      } else {
        const vComp = validateCodeCompleteness(files);
        const vSyn = validateSyntaxStatic(files);
        summary = `Completude: ${vComp.passed ? 'OK' : 'FALHA'} | Sintaxe: ${vSyn.passed ? 'OK' : 'FALHA'} (${files.length} arquivos).`;
      }

      await updateAutomationRun({
        jobId: job.id,
        status: 'COMPLETED',
        lastRunSummary: summary,
        runCount: job.runCount + 1,
      });
      await writeAuditLog({
        actorId: user.uid,
        module: 'automations',
        action: `run_${job.actionType}`,
        severity: 'info',
        detail: `${job.name}: ${summary}`,
      });
      notify('success', 'Automação concluída', summary);
    } catch (err) {
      await updateAutomationRun({
        jobId: job.id,
        status: 'FAILED',
        lastRunSummary: err instanceof Error ? err.message : String(err),
        runCount: job.runCount + 1,
      });
      notify('error', 'Falha na automação', err instanceof Error ? err.message : String(err));
    } finally {
      setRunningId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-6 space-y-5">
        <div className="space-y-1">
          <h2 className="font-display text-xl font-bold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-red-500" />
            TITAN Automation & Queue Center
          </h2>
          <p className="text-xs text-zinc-400">
            Pipelines automatizados persistidos no Firestore (incluindo Backup SHA-256) e monitor da fila assíncrona de tarefas em background.
          </p>
        </div>

        <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome da automação"
            className="px-3 py-2 bg-[#070709] border border-zinc-800 rounded-lg text-sm text-zinc-100"
          />
          <select
            value={actionType}
            onChange={(e) => setActionType(e.target.value as AutomationJobDoc['actionType'])}
            className="px-3 py-2 bg-[#070709] border border-zinc-800 rounded-lg text-sm text-zinc-200"
          >
            <option value="static-analysis">Análise Estática</option>
            <option value="security-scan">Auditoria de Segurança (IA)</option>
            <option value="project-audit">Auditoria de Completude</option>
            <option value="test-suite">Verificação em Sandbox</option>
            <option value="backup-sync">Backup SHA-256 Automático</option>
            <option value="auto-fix">Correção Assistida</option>
            <option value="docs-gen">Documentação</option>
          </select>
          <select
            value={targetProjectId}
            onChange={(e) => setTargetProjectId(e.target.value)}
            className="px-3 py-2 bg-[#070709] border border-zinc-800 rounded-lg text-sm text-zinc-200"
          >
            <option value="">Primeiro projeto disponível</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Criar Pipeline
          </button>
        </form>
      </div>

      <div className="space-y-3">
        {automations.length === 0 ? (
          <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-10 text-center text-xs text-zinc-500">
            Nenhuma automação configurada ainda.
          </div>
        ) : (
          automations.map((job) => (
            <div
              key={job.id}
              className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <span className="font-mono text-red-400">{job.actionType}</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">Execuções: {job.runCount}</span>
                  <span aria-hidden="true">·</span>
                  <span>Status: {job.status}</span>
                </div>
                <h3 className="font-display text-base font-semibold text-white">{job.name}</h3>
                <p className="text-xs text-zinc-400 break-words">{job.lastRunSummary}</p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleRunJob(job)}
                  disabled={runningId === job.id}
                  className="px-4 py-2 bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {runningId === job.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  Executar
                </button>
                <button
                  type="button"
                  onClick={() => void deleteAutomationJob(job.id)}
                  className="p-2 text-zinc-500 hover:text-red-400 cursor-pointer"
                  title="Excluir automação"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Async Queue Overview */}
      <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-white">
            Fila Assíncrona de Tarefas ({queueJobs.length})
          </span>
          <button
            type="button"
            onClick={() => void loadQueue()}
            className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Atualizar Fila</span>
          </button>
        </div>
        {queueJobs.length === 0 ? (
          <p className="text-xs text-zinc-500">Sem tarefas em background no momento.</p>
        ) : (
          <div className="space-y-2">
            {queueJobs.slice(0, 8).map((q) => (
              <div key={q.id} className="p-3 rounded-lg bg-[#070709] border border-zinc-800 flex items-center justify-between text-xs">
                <span className="text-zinc-200 truncate">{q.title}</span>
                <div className="flex items-center gap-3 shrink-0 font-mono">
                  <span className="text-zinc-400">{q.priority} · {q.status} ({q.progress}%)</span>
                  {(q.status === 'QUEUED' || q.status === 'RUNNING') && (
                    <button
                      type="button"
                      onClick={() => void cancelQueuedJob(q.id).then(() => loadQueue())}
                      className="text-red-400 hover:text-red-300 cursor-pointer"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
