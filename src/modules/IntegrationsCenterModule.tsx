import { CheckCircle2, Cpu, KeyRound, PlugZap, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTitan } from '../contexts/TitanContext.tsx';
import {
  fetchAiProviders,
  fetchIntegrationsStatus,
  fetchNeuralStatus,
  saveVaultSecret,
  testAiProvider,
  testDeployProvider,
} from '../lib/titanApi.ts';
import type {
  AiRequestHistoryEntry,
  DeployProviderId,
  NeuralModelStatus,
} from '../shared/titanTypes.ts';

const HOSTING_SLOTS: Array<{ id: DeployProviderId; label: string; hint: string }> = [
  { id: 'render', label: 'Render API Key', hint: 'rnd_...' },
  { id: 'vercel', label: 'Vercel Token', hint: 'Token pessoal ou team' },
  { id: 'netlify', label: 'Netlify Personal Token', hint: 'nfp_...' },
  { id: 'railway', label: 'Railway API Token', hint: 'Token GraphQL Railway' },
  { id: 'cloudflare', label: 'Cloudflare API Token', hint: 'Pages / Workers' },
];

export function IntegrationsCenterModule() {
  const { notify } = useTitan();
  const [neuralStatus, setNeuralStatus] = useState<NeuralModelStatus | null>(null);
  const [history, setHistory] = useState<AiRequestHistoryEntry[]>([]);
  const [vaultStatus, setVaultStatus] = useState<Array<{ slot: string; source: string; configured: boolean }>>([]);
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [pRes, iRes, nRes] = await Promise.all([
        fetchAiProviders(),
        fetchIntegrationsStatus(),
        fetchNeuralStatus(),
      ]);
      setHistory(pRes.history);
      setVaultStatus(iRes.vault);
      setNeuralStatus(nRes.model);
    } catch (err) {
      notify('error', 'Erro ao carregar status', err instanceof Error ? err.message : String(err));
    }
  }, [notify]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleTestNeuralCore = async () => {
    setBusyId('titan-neural-core');
    try {
      const res = await testAiProvider('titan-neural-core');
      notify(res.ok ? 'success' : 'warning', `TITAN Neural Core (${res.status})`, res.detail);
      await loadAll();
    } catch (err) {
      notify('error', 'Falha no diagnóstico', err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveVaultToken = async (slot: string) => {
    setBusyId(slot);
    try {
      await saveVaultSecret(slot, keyDrafts[slot] || '');
      setKeyDrafts((prev) => ({ ...prev, [slot]: '' }));
      notify('success', `Cofre atualizado (${slot})`, 'Credencial cifrada com AES-256-GCM no servidor.');
      await loadAll();
    } catch (err) {
      notify('error', 'Erro ao gravar token', err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleTestHosting = async (provider: DeployProviderId) => {
    setBusyId(provider);
    try {
      const res = await testDeployProvider(provider);
      notify(res.status === 'CONNECTED' ? 'success' : 'warning', `${provider}: ${res.status}`, res.detail);
    } catch (err) {
      notify('error', 'Erro ao testar provedor', err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white tracking-tight">
            TITAN Autonomous Core & Cloud Vault
          </h1>
          <p className="text-sm text-zinc-400">
            Motor Neural próprio sem dependência de IAs externas, além de tokens de Deploy Cloud e GitHub cifrados em AES-256-GCM.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadAll()}
          className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-medium rounded-lg flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Atualizar Status</span>
        </button>
      </div>

      {/* Proprietary TITAN Neural Core Status */}
      <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-sm font-semibold text-white">
            <Cpu className="w-4 h-4 text-red-500" />
            <span>TITAN Neural Core (Inteligência Própria Independente)</span>
          </div>
          <button
            type="button"
            onClick={() => void handleTestNeuralCore()}
            disabled={busyId === 'titan-neural-core'}
            className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 rounded-lg cursor-pointer"
          >
            Testar Integridade Local
          </button>
        </div>

        {neuralStatus && (
          <div className="p-4 rounded-xl bg-[#09090D] border border-zinc-800 space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-emerald-400 font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{neuralStatus.architecture}</span>
              </div>
              <span className="font-mono text-zinc-400">
                Dependências Externas de IA: {neuralStatus.externalAiDependencies.length} (Zero)
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 font-mono">
              <div className="bg-[#0E0E13] border border-zinc-800 rounded-lg p-2.5">
                <div className="text-[11px] text-zinc-500">Parâmetros Reais</div>
                <div className="text-white font-semibold tabular-nums">
                  {neuralStatus.parameterCount.toLocaleString('en-US')}
                </div>
              </div>
              <div className="bg-[#0E0E13] border border-zinc-800 rounded-lg p-2.5">
                <div className="text-[11px] text-zinc-500">Vocabulário BPE</div>
                <div className="text-white font-semibold tabular-nums">{neuralStatus.vocabSize} tokens</div>
              </div>
              <div className="bg-[#0E0E13] border border-zinc-800 rounded-lg p-2.5">
                <div className="text-[11px] text-zinc-500">Loss / Perplexity</div>
                <div className="text-emerald-400 font-semibold tabular-nums">
                  {neuralStatus.currentLoss} / {neuralStatus.perplexity}
                </div>
              </div>
              <div className="bg-[#0E0E13] border border-zinc-800 rounded-lg p-2.5">
                <div className="text-[11px] text-zinc-500">Steps / Épocas</div>
                <div className="text-white font-semibold tabular-nums">
                  {neuralStatus.trainingSteps} ({neuralStatus.epochsCompleted} ep)
                </div>
              </div>
            </div>

            <p className="text-zinc-400 leading-relaxed">{neuralStatus.capacityDisclosure}</p>
          </div>
        )}
      </div>

      {/* Hosting & GitHub Vault */}
      <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <KeyRound className="w-4 h-4 text-red-500" />
          <span>Credenciais Cloud, Deploy & GitHub (Cofre do Servidor)</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[...HOSTING_SLOTS.map((h) => ({ slot: h.id, label: h.label, hint: h.hint, testable: true })), { slot: 'github', label: 'GitHub Personal Access Token', hint: 'ghp_... / github_pat_...', testable: false }].map((item) => {
            const st = vaultStatus.find((v) => v.slot === item.slot);
            return (
              <div key={item.slot} className="p-3.5 rounded-lg bg-[#09090D] border border-zinc-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-zinc-200">{item.label}</span>
                  <span className={`font-mono text-[11px] ${st?.configured ? 'text-emerald-400' : 'text-zinc-500'}`}>
                    {st?.configured ? `CONFIGURADO (${st.source})` : 'CONFIGURATION_REQUIRED'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={keyDrafts[item.slot] || ''}
                    onChange={(e) => setKeyDrafts((prev) => ({ ...prev, [item.slot]: e.target.value }))}
                    placeholder={item.hint}
                    className="flex-1 bg-[#0E0E13] border border-zinc-800 rounded-lg px-3 py-1.5 text-xs font-mono text-white"
                  />
                  <button
                    type="button"
                    onClick={() => void handleSaveVaultToken(item.slot)}
                    disabled={busyId === item.slot}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg cursor-pointer"
                  >
                    Gravar
                  </button>
                  {item.testable && (
                    <button
                      type="button"
                      onClick={() => void handleTestHosting(item.slot as DeployProviderId)}
                      disabled={busyId === item.slot}
                      className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded-lg cursor-pointer"
                    >
                      <PlugZap className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Neural Core Inference History */}
      <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-5 space-y-3">
        <div className="text-sm font-semibold text-white">
          Histórico de Inferências do TITAN Neural Core ({history.length})
        </div>
        {history.length === 0 ? (
          <p className="text-xs text-zinc-500">Nenhuma inferência registrada desde o último boot.</p>
        ) : (
          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {history.map((h) => (
              <div key={h.id} className="p-2.5 rounded bg-[#09090D] border border-zinc-800 text-xs flex items-center justify-between gap-3">
                <div className="truncate">
                  <span className={`font-mono mr-2 ${h.success ? 'text-emerald-400' : 'text-red-400'}`}>
                    [{h.providerId}:{h.model}]
                  </span>
                  <span className="text-zinc-300">{h.taskType}</span>
                  {h.error && <span className="text-red-400 ml-2">— {h.error}</span>}
                </div>
                <span className="font-mono text-zinc-500 shrink-0 tabular-nums">
                  {h.latencyMs}ms · ~{h.estimatedTokens}t
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
