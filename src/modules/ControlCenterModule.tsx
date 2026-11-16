import { Activity, Cpu, FolderKanban, RefreshCw, Server, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTitan } from '../contexts/TitanContext.tsx';
import {
  cancelQueuedJob,
  clearServerCache,
  fetchAiProviders,
  fetchPerformanceMetrics,
  fetchQueueJobs,
  resetFinishedQueueJobs,
} from '../lib/titanApi.ts';
import type {
  AiProviderConfigSummary,
  PerformanceMetricsSnapshot,
  QueueJob,
} from '../shared/titanTypes.ts';

export function ControlCenterModule() {
  const { capabilities, projects, deployments, backups, auditLogs, setActiveNav, notify } = useTitan();
  const [metrics, setMetrics] = useState<PerformanceMetricsSnapshot | null>(null);
  const [providers, setProviders] = useState<AiProviderConfigSummary[]>([]);
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      const [m, p, q] = await Promise.all([
        fetchPerformanceMetrics(),
        fetchAiProviders(),
        fetchQueueJobs(),
      ]);
      setMetrics(m);
      setProviders(p.providers);
      setJobs(q.jobs);
    } catch (err) {
      notify('error', 'Erro no Control Center', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const handleClearCache = async () => {
    const res = await clearServerCache();
    notify('success', 'Cache do servidor limpo', `${res.clearedEntries} entrada(s) liberada(s).`);
    void refreshAll();
  };

  const handleResetQueue = async () => {
    const res = await resetFinishedQueueJobs();
    notify('info', 'Fila higienizada', `${res.removed} tarefa(s) finalizada(s) removida(s).`);
    void refreshAll();
  };

  const handleCancelJob = async (id: string) => {
    await cancelQueuedJob(id);
    notify('warning', 'Tarefa cancelada', `Job ${id} interrompido.`);
    void refreshAll();
  };

  const connectedProviders = providers.filter((p) => p.enabled && p.hasCredential).length;
  const onlineDeployments = deployments.filter((d) => d.status === 'ONLINE').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white tracking-tight">
            TITAN Control Center
          </h1>
          <p className="text-sm text-zinc-400">
            Console central de operações, saúde dos serviços, filas assíncronas, deploys e diagnóstico em tempo real.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleClearCache()}
            className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-medium rounded-lg flex items-center gap-1.5 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5 text-amber-400" />
            <span>Limpar Cache</span>
          </button>
          <button
            type="button"
            onClick={() => void refreshAll()}
            disabled={loading}
            className="px-3 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded-lg flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar Tudo</span>
          </button>
        </div>
      </div>

      {/* Infrastructure Health Matrix */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Backend & Runtime</span>
            <Server className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="font-mono text-lg font-bold text-white">
            Node {capabilities?.nodeVersion || '—'}
          </div>
          <p className="text-xs text-zinc-500">
            Python: {capabilities?.pythonAvailable ? 'OK' : 'Ausente'} · Git: {capabilities?.gitAvailable ? 'OK' : 'Ausente'}
          </p>
        </div>

        <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Provedores de IA Ativos</span>
            <Cpu className="w-4 h-4 text-red-500" />
          </div>
          <div className="font-mono text-lg font-bold text-white tabular-nums">
            {connectedProviders} / {providers.length}
          </div>
          <button
            type="button"
            onClick={() => setActiveNav('integrations-center')}
            className="text-xs text-red-400 hover:text-red-300 cursor-pointer"
          >
            Gerenciar provedores →
          </button>
        </div>

        <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Deploys & Backups</span>
            <FolderKanban className="w-4 h-4 text-red-500" />
          </div>
          <div className="font-mono text-lg font-bold text-white tabular-nums">
            {onlineDeployments} Online · {backups.length} Bkp
          </div>
          <p className="text-xs text-zinc-500">
            Projetos no Workspace: {projects.length}
          </p>
        </div>

        <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Persistência & Segurança</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="font-mono text-lg font-bold text-white">
            {capabilities?.firebaseConfigured ? 'Firestore Ativo' : 'Pendente'}
          </div>
          <p className="text-xs text-zinc-500">
            Latência média: {metrics?.avgLatencyMs ?? 0} ms
          </p>
        </div>
      </div>

      {/* Live Queue & Recent Audit Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Activity className="w-4 h-4 text-red-500" />
              <span>Fila Assíncrona de Tarefas ({jobs.length})</span>
            </div>
            <button
              type="button"
              onClick={() => void handleResetQueue()}
              className="text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer"
            >
              Limpar concluídas
            </button>
          </div>

          {jobs.length === 0 ? (
            <p className="text-xs text-zinc-500 py-6 text-center">
              Nenhuma tarefa assíncrona na fila atual.
            </p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className="p-3 rounded-lg bg-[#09090D] border border-zinc-800/80 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="text-xs font-medium text-zinc-200 truncate">{job.title}</p>
                    <p className="text-[11px] text-zinc-500 font-mono">
                      {job.priority} · {job.status} · {job.progress}%
                    </p>
                  </div>
                  {(job.status === 'QUEUED' || job.status === 'RUNNING') && (
                    <button
                      type="button"
                      onClick={() => void handleCancelJob(job.id)}
                      className="p-1.5 text-zinc-400 hover:text-red-400 cursor-pointer"
                      title="Cancelar tarefa"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-5 space-y-4">
          <div className="text-sm font-semibold text-white">
            Últimos Eventos de Auditoria ({auditLogs.length})
          </div>
          {auditLogs.length === 0 ? (
            <p className="text-xs text-zinc-500 py-6 text-center">Sem logs registrados.</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {auditLogs.slice(0, 12).map((log) => (
                <div
                  key={log.id}
                  className="p-3 rounded-lg bg-[#09090D] border border-zinc-800/80 space-y-1"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-mono text-red-400">{log.module} · {log.action}</span>
                    <span className="text-zinc-500 uppercase">{log.severity}</span>
                  </div>
                  <p className="text-xs text-zinc-300">{log.detail}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
