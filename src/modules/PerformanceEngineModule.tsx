import { Activity, Cpu, Database, HardDrive, RefreshCw, Trash2, Zap } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTitan } from '../contexts/TitanContext.tsx';
import { clearServerCache, fetchPerformanceMetrics } from '../lib/titanApi.ts';
import type { PerformanceMetricsSnapshot } from '../shared/titanTypes.ts';

export function PerformanceEngineModule() {
  const { notify } = useTitan();
  const [metrics, setMetrics] = useState<PerformanceMetricsSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [adaptiveLowBandwidth, setAdaptiveLowBandwidth] = useState(false);

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await fetchPerformanceMetrics();
      setMetrics(snap);
    } catch (err) {
      notify('error', 'Falha ao coletar métricas', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void loadMetrics();
  }, [loadMetrics]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => {
      void loadMetrics();
    }, adaptiveLowBandwidth ? 15000 : 5000);
    return () => clearInterval(id);
  }, [autoRefresh, adaptiveLowBandwidth, loadMetrics]);

  const handleClearCache = async () => {
    try {
      const res = await clearServerCache();
      notify('success', 'Cache limpo', `${res.clearedEntries} entrada(s) removida(s) do cache seguro.`);
      await loadMetrics();
    } catch (err) {
      notify('error', 'Erro ao limpar cache', err instanceof Error ? err.message : String(err));
    }
  };

  const cacheHitRate =
    metrics && metrics.cacheHits + metrics.cacheMisses > 0
      ? Math.round((metrics.cacheHits / (metrics.cacheHits + metrics.cacheMisses)) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white tracking-tight">
            TITAN Performance Engine
          </h1>
          <p className="text-sm text-zinc-400">
            Telemetria real de processo Node.js, latência de API, cache TTL, compressão gzip e fila assíncrona.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="px-3 py-2 bg-[#0E0E13] border border-zinc-800 rounded-lg text-xs text-zinc-300 flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="accent-red-600"
            />
            <span>Auto-Refresh</span>
          </label>
          <label className="px-3 py-2 bg-[#0E0E13] border border-zinc-800 rounded-lg text-xs text-zinc-300 flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={adaptiveLowBandwidth}
              onChange={(e) => setAdaptiveLowBandwidth(e.target.checked)}
              className="accent-red-600"
            />
            <span>Modo Economia (Mobile)</span>
          </label>
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
            onClick={() => void loadMetrics()}
            disabled={loading}
            className="px-3 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white text-xs font-medium rounded-lg flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {metrics && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-5 space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Memória RSS / Heap</span>
                <HardDrive className="w-4 h-4 text-red-500" />
              </div>
              <div className="font-mono text-2xl font-bold text-white tabular-nums">
                {metrics.memoryRssMb} MB
              </div>
              <p className="text-xs text-zinc-500 tabular-nums">
                Heap: {metrics.heapUsedMb} / {metrics.heapTotalMb} MB
              </p>
            </div>

            <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-5 space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Latência Média / P95</span>
                <Zap className="w-4 h-4 text-red-500" />
              </div>
              <div className="font-mono text-2xl font-bold text-white tabular-nums">
                {metrics.avgLatencyMs} ms
              </div>
              <p className="text-xs text-zinc-500 tabular-nums">
                P95: {metrics.p95LatencyMs} ms · Req: {metrics.totalRequests}
              </p>
            </div>

            <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-5 space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>CPU Load (1m) & Uptime</span>
                <Cpu className="w-4 h-4 text-red-500" />
              </div>
              <div className="font-mono text-2xl font-bold text-white tabular-nums">
                {metrics.cpuLoad1m}
              </div>
              <p className="text-xs text-zinc-500 tabular-nums">
                Uptime: {metrics.uptimeSec}s · Erros HTTP: {metrics.errorRequests}
              </p>
            </div>

            <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-5 space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Cache Seguro & Fila</span>
                <Database className="w-4 h-4 text-red-500" />
              </div>
              <div className="font-mono text-2xl font-bold text-white tabular-nums">
                {cacheHitRate}% Hit
              </div>
              <p className="text-xs text-zinc-500 tabular-nums">
                Entradas: {metrics.cacheEntries} · Fila: {metrics.queueRunning} run / {metrics.queueQueued} wait
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Activity className="w-4 h-4 text-red-500" />
                <span>Otimizações Estruturais Ativas</span>
              </div>
              <ul className="space-y-2 text-xs text-zinc-300">
                <li className="flex items-center justify-between py-1.5 border-b border-zinc-800/70">
                  <span>Code Splitting sob demanda (React.lazy + Suspense)</span>
                  <span className="text-emerald-400 font-mono">ATIVO</span>
                </li>
                <li className="flex items-center justify-between py-1.5 border-b border-zinc-800/70">
                  <span>Compressão HTTP gzip/deflate (Express middleware)</span>
                  <span className="text-emerald-400 font-mono">ATIVO</span>
                </li>
                <li className="flex items-center justify-between py-1.5 border-b border-zinc-800/70">
                  <span>Cache TTL de capacidades do ambiente (15s)</span>
                  <span className="text-emerald-400 font-mono">ATIVO</span>
                </li>
                <li className="flex items-center justify-between py-1.5">
                  <span>Processamento assíncrono via Worker Queue</span>
                  <span className="text-emerald-400 font-mono">ATIVO</span>
                </li>
              </ul>
            </div>

            <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-5 space-y-3">
              <div className="text-sm font-semibold text-white">
                Tempos Recentes de Execução & Geração
              </div>
              <div className="space-y-2 text-xs text-zinc-300">
                <div className="flex items-center justify-between py-1.5 border-b border-zinc-800/70">
                  <span>Último pipeline de geração/validação</span>
                  <span className="font-mono text-zinc-100 tabular-nums">
                    {metrics.lastBuildCheckMs !== null ? `${metrics.lastBuildCheckMs} ms` : 'Ainda não executado'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-zinc-800/70">
                  <span>Última execução isolada no sandbox</span>
                  <span className="font-mono text-zinc-100 tabular-nums">
                    {metrics.lastExecutionMs !== null ? `${metrics.lastExecutionMs} ms` : 'Ainda não executado'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span>Última coleta de telemetria</span>
                  <span className="font-mono text-zinc-400 tabular-nums">
                    {new Date(metrics.collectedAt).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
