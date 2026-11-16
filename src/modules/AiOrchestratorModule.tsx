import { ArrowRight, GitBranch, Layers, Play, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useTitan } from '../contexts/TitanContext.tsx';
import { fetchQueueJobs, orchestrateTask } from '../lib/titanApi.ts';
import type { OrchestratorPlanResult, QueueJob } from '../shared/titanTypes.ts';

export function AiOrchestratorModule() {
  const { setActiveNav, notify } = useTitan();
  const [prompt, setPrompt] = useState('');
  const [autoQueue, setAutoQueue] = useState(true);
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<OrchestratorPlanResult | null>(null);
  const [jobs, setJobs] = useState<QueueJob[]>([]);

  const handleOrchestrate = async () => {
    if (prompt.trim().length < 3) {
      notify('warning', 'Prompt curto', 'Descreva o objetivo técnico para o Orquestrador.');
      return;
    }
    setLoading(true);
    try {
      const res = await orchestrateTask(prompt, autoQueue);
      setPlan(res);
      const q = await fetchQueueJobs();
      setJobs(q.jobs);
      notify(
        'success',
        'Roteamento concluído',
        `Alvo recomendado: ${res.targetModule}${res.queuedJobId ? ` (Job ${res.queuedJobId} enfileirado)` : ''}`,
      );
    } catch (err) {
      notify('error', 'Erro no Orquestrador', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const refreshQueue = async () => {
    try {
      const q = await fetchQueueJobs();
      setJobs(q.jobs);
    } catch {
      // Ignore silent refresh error
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white tracking-tight">
          TITAN AI Orchestrator
        </h1>
        <p className="text-sm text-zinc-400">
          Interpretação automática de intenção, decomposição em etapas e execução coordenada pela fila assíncrona.
        </p>
      </div>

      <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-5 space-y-4">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          placeholder="Ex: Quero preparar o deploy deste sistema no Render com Dockerfile, verificar o DNS do domínio exemplo.com e validar segurança..."
          className="w-full bg-[#09090D] border border-zinc-800 rounded-lg p-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-red-600"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="text-xs text-zinc-300 flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoQueue}
              onChange={(e) => setAutoQueue(e.target.checked)}
              className="accent-red-600"
            />
            <span>Enfileirar execução assíncrona automaticamente quando aplicável</span>
          </label>

          <button
            type="button"
            onClick={() => void handleOrchestrate()}
            disabled={loading}
            className="px-4 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white text-xs font-semibold rounded-lg flex items-center gap-2 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{loading ? 'Orquestrando...' : 'Analisar & Orquestrar'}</span>
          </button>
        </div>
      </div>

      {plan && (
        <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-red-500" />
              <h2 className="text-sm font-semibold text-white">
                Plano de Orquestração ({plan.priority})
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setActiveNav(plan.targetModule)}
              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs text-zinc-100 rounded-lg flex items-center gap-1.5 cursor-pointer"
            >
              <span>Abrir módulo {plan.targetModule}</span>
              <ArrowRight className="w-3.5 h-3.5 text-red-500" />
            </button>
          </div>
          <p className="text-xs text-zinc-300">{plan.reason}</p>
          <ol className="space-y-1.5 text-xs text-zinc-400 list-decimal list-inside">
            {plan.steps.map((s, idx) => (
              <li key={idx}>{s}</li>
            ))}
          </ol>
        </div>
      )}

      <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <GitBranch className="w-4 h-4 text-red-500" />
            <span>Execuções Coordenadas Recentes</span>
          </div>
          <button
            type="button"
            onClick={() => void refreshQueue()}
            className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Atualizar</span>
          </button>
        </div>

        {jobs.length === 0 ? (
          <p className="text-xs text-zinc-500">Nenhuma execução orquestrada na sessão.</p>
        ) : (
          <div className="space-y-2">
            {jobs.slice(0, 8).map((j) => (
              <div key={j.id} className="p-3 rounded-lg bg-[#09090D] border border-zinc-800 flex items-center justify-between text-xs">
                <span className="text-zinc-200 truncate">{j.title}</span>
                <span className="font-mono text-zinc-400 shrink-0 ml-3">
                  {j.status} ({j.progress}%)
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
