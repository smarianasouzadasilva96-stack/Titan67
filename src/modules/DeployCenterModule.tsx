import {
  CheckCircle2,
  Cloud,
  Copy,
  ExternalLink,
  Globe,
  PauseCircle,
  Play,
  RotateCcw,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import { useState } from 'react';
import { useTitan } from '../contexts/TitanContext.tsx';
import {
  analyzeDeployProject,
  testDeployProvider,
  triggerRemoteDeploy,
  verifyDnsAndTls,
} from '../lib/titanApi.ts';
import {
  addOrUpdateProjectFile,
  saveDeploymentRecord,
  updateDeploymentStatus,
  writeAuditLog,
} from '../lib/workspaceService.ts';
import type {
  DeployConfigBundle,
  DeployEnvironment,
  DeployProviderId,
  DnsTlsProbeResult,
} from '../shared/titanTypes.ts';

const PROVIDERS: Array<{ id: DeployProviderId; label: string; desc: string }> = [
  { id: 'render', label: 'Render', desc: 'Web Service / Docker (render.yaml)' },
  { id: 'vercel', label: 'Vercel', desc: 'Edge & Serverless API v13' },
  { id: 'netlify', label: 'Netlify', desc: 'Static + Edge (netlify.toml)' },
  { id: 'railway', label: 'Railway', desc: 'Containers & Full-Stack' },
  { id: 'cloudflare', label: 'Cloudflare', desc: 'Pages & Workers (wrangler.toml)' },
  { id: 'docker-vps', label: 'VPS / Docker', desc: 'Linux + Docker Compose + Nginx' },
];

export function DeployCenterModule() {
  const {
    user,
    projects,
    selectedProjectId,
    setSelectedProjectId,
    selectedProjectFiles,
    deployments,
    notify,
  } = useTitan();

  const [provider, setProvider] = useState<DeployProviderId>('render');
  const [environment, setEnvironment] = useState<DeployEnvironment>('production');
  const [customDomain, setCustomDomain] = useState('');
  const [bundle, setBundle] = useState<DeployConfigBundle | null>(null);
  const [selectedConfigIdx, setSelectedConfigIdx] = useState(0);
  const [dnsProbe, setDnsProbe] = useState<DnsTlsProbeResult | null>(null);
  const [providerTestResult, setProviderTestResult] = useState<string | null>(null);
  const [deployLogs, setDeployLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const activeProject = projects.find((p) => p.id === selectedProjectId) || null;

  const handleAnalyze = async () => {
    if (!activeProject) {
      notify('warning', 'Sem projeto', 'Selecione ou crie um projeto no Workspace primeiro.');
      return;
    }
    setLoading(true);
    try {
      const res = await analyzeDeployProject({
        projectName: activeProject.name,
        files: selectedProjectFiles.map((f) => ({
          path: f.path,
          content: f.content,
          language: f.language,
        })),
        environment,
        provider,
      });
      setBundle(res);
      setSelectedConfigIdx(0);
      notify('success', 'Análise de Deploy concluída', `Stack detectada: ${res.detectedStack}`);
    } catch (err) {
      notify('error', 'Erro na análise', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleTestProvider = async () => {
    setLoading(true);
    try {
      const res = await testDeployProvider(provider);
      setProviderTestResult(`${res.status} (${res.latencyMs}ms): ${res.detail}`);
      notify(res.status === 'CONNECTED' ? 'success' : 'warning', `Provedor ${provider}`, res.detail);
    } catch (err) {
      notify('error', 'Falha no teste', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyDns = async () => {
    if (!customDomain.trim()) {
      notify('warning', 'Domínio vazio', 'Informe um domínio público (ex: example.com) para verificação real DNS/TLS.');
      return;
    }
    setLoading(true);
    try {
      const probe = await verifyDnsAndTls(customDomain.trim());
      setDnsProbe(probe);
      notify(
        probe.httpsReachable && probe.tlsValid ? 'success' : 'warning',
        `Sonda DNS/TLS (${probe.domain})`,
        probe.httpsReachable ? `HTTPS HTTP ${probe.httpStatus} (${probe.responseTimeMs}ms)` : probe.error || 'Inacessível',
      );
    } catch (err) {
      notify('error', 'Erro ao testar domínio', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfigsToProject = async () => {
    if (!user || !activeProject || !bundle) return;
    setLoading(true);
    try {
      let currentCount = activeProject.filesCount;
      for (const cfg of bundle.files) {
        const existing = selectedProjectFiles.find((f) => f.path === cfg.path);
        await addOrUpdateProjectFile({
          projectId: activeProject.id,
          ownerId: user.uid,
          fileId: existing?.id,
          path: cfg.path,
          content: cfg.content,
          language: cfg.language,
          fileKind: cfg.fileKind,
          currentVersion: existing?.version,
          currentFilesCount: existing ? undefined : currentCount,
        });
        if (!existing) currentCount += 1;
      }
      notify('success', 'Arquivos salvos', `${bundle.files.length} arquivos de deploy adicionados a ${activeProject.name}.`);
    } catch (err) {
      notify('error', 'Erro ao salvar manifests', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerDeploy = async () => {
    if (!user || !activeProject) {
      notify('warning', 'Selecione um projeto', 'Escolha um projeto no Workspace para publicar.');
      return;
    }
    setLoading(true);
    try {
      const res = await triggerRemoteDeploy({
        provider,
        projectName: activeProject.name,
        files: selectedProjectFiles.map((f) => ({ path: f.path, content: f.content })),
        environment,
      });
      setDeployLogs(res.logs);

      const nextVer = `v1.0.${deployments.filter((d) => d.projectId === activeProject.id).length + 1}`;
      await saveDeploymentRecord({
        ownerId: user.uid,
        projectId: activeProject.id,
        projectName: activeProject.name,
        provider,
        environment,
        status: res.status,
        version: nextVer,
        url: res.url,
        domain: customDomain.trim() || undefined,
        logsSummary: res.logs.join(' | '),
      });

      await writeAuditLog({
        actorId: user.uid,
        module: 'deploy-center',
        action: `deploy_${res.status.toLowerCase()}`,
        severity: res.status === 'FAILED' ? 'error' : 'info',
        detail: `${activeProject.name} -> ${provider} (${environment}): ${res.status}`,
      });

      notify(
        res.status === 'ONLINE' ? 'success' : res.status === 'FAILED' ? 'error' : 'info',
        `Deploy ${res.status}`,
        res.logs[res.logs.length - 1] || 'Registro salvo no histórico.',
      );
    } catch (err) {
      notify('error', 'Falha ao publicar', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCopyFile = (content: string) => {
    void navigator.clipboard.writeText(content);
    notify('info', 'Copiado', 'Conteúdo copiado para a área de transferência.');
  };

  const activeCfg = bundle?.files[selectedConfigIdx];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white tracking-tight">
            TITAN Deploy Center
          </h1>
          <p className="text-sm text-zinc-400">
            Preparação automatizada, geração de Dockerfile/manifests, deploy via APIs oficiais e verificação real de DNS, HTTPS e SSL/TLS.
          </p>
        </div>

        <select
          value={selectedProjectId || ''}
          onChange={(e) => setSelectedProjectId(e.target.value || null)}
          className="bg-[#0E0E13] border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200"
        >
          {projects.length === 0 ? (
            <option value="">Sem projetos no Workspace</option>
          ) : (
            projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.filesCount} arquivos)
              </option>
            ))
          )}
        </select>
      </div>

      {/* Provider & Environment Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-[#0E0E13] border border-zinc-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">1. Destino & Ambiente</h2>
            <div className="flex gap-1.5">
              {(['production', 'staging', 'preview'] as DeployEnvironment[]).map((env) => (
                <button
                  key={env}
                  type="button"
                  onClick={() => setEnvironment(env)}
                  className={`px-2.5 py-1 rounded text-xs font-mono cursor-pointer ${
                    environment === env
                      ? 'bg-red-600 text-white'
                      : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {env}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setProvider(p.id)}
                className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                  provider === p.id
                    ? 'bg-red-600/15 border-red-600/60 text-white'
                    : 'bg-[#09090D] border-zinc-800 text-zinc-300 hover:border-zinc-700'
                }`}
              >
                <div className="text-xs font-semibold">{p.label}</div>
                <div className="text-[11px] text-zinc-500 mt-0.5">{p.desc}</div>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={() => void handleAnalyze()}
              disabled={loading || !activeProject}
              className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 border border-zinc-700 text-zinc-100 text-xs font-medium rounded-lg flex items-center gap-1.5 cursor-pointer"
            >
              <Terminal className="w-3.5 h-3.5 text-red-500" />
              <span>Analisar & Gerar Configs</span>
            </button>

            <button
              type="button"
              onClick={() => void handleTestProvider()}
              disabled={loading}
              className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 border border-zinc-700 text-zinc-100 text-xs font-medium rounded-lg flex items-center gap-1.5 cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Testar Conexão ({provider})</span>
            </button>

            <button
              type="button"
              onClick={() => void handleTriggerDeploy()}
              disabled={loading || !activeProject}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Publicar ({provider})</span>
            </button>
          </div>

          {providerTestResult && (
            <div className="p-3 rounded-lg bg-[#09090D] border border-zinc-800 text-xs font-mono text-zinc-300">
              {providerTestResult}
            </div>
          )}
        </div>

        {/* Real DNS & TLS Checker */}
        <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Globe className="w-4 h-4 text-red-500" />
            <span>Sonda Real DNS, HTTPS & TLS</span>
          </div>
          <p className="text-xs text-zinc-400">
            Nunca exibimos status ONLINE sem verificar DNS, handshake TLS e resposta HTTP real.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={customDomain}
              onChange={(e) => setCustomDomain(e.target.value)}
              placeholder="app.seudominio.com"
              className="flex-1 bg-[#09090D] border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-red-600"
            />
            <button
              type="button"
              onClick={() => void handleVerifyDns()}
              disabled={loading}
              className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs text-white rounded-lg cursor-pointer"
            >
              Verificar
            </button>
          </div>

          {dnsProbe && (
            <div className="p-3 rounded-lg bg-[#09090D] border border-zinc-800 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-400">DNS A Records:</span>
                <span className="font-mono text-zinc-200">
                  {dnsProbe.dnsResolved ? dnsProbe.addresses.join(', ') : 'Falhou'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">TLS/SSL:</span>
                <span className={`font-mono ${dnsProbe.tlsValid ? 'text-emerald-400' : 'text-red-400'}`}>
                  {dnsProbe.tlsValid ? `Válido (${dnsProbe.tlsIssuer || 'OK'})` : 'Inválido/Ausente'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">HTTPS Probe:</span>
                <span className="font-mono text-zinc-200">
                  {dnsProbe.httpsReachable
                    ? `HTTP ${dnsProbe.httpStatus} (${dnsProbe.responseTimeMs}ms)`
                    : dnsProbe.error || 'Inacessível'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bundle Analysis & Configs */}
      {bundle && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Checklist de Preparação</h3>
              <button
                type="button"
                onClick={() => void handleSaveConfigsToProject()}
                className="text-xs text-red-400 hover:text-red-300 cursor-pointer"
              >
                Salvar no Projeto
              </button>
            </div>
            <div className="space-y-2">
              {bundle.steps.map((s) => (
                <div key={s.step} className="text-xs flex items-start gap-2">
                  <CheckCircle2
                    className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                      s.status === 'PASSED'
                        ? 'text-emerald-400'
                        : s.status === 'WARNING'
                        ? 'text-amber-400'
                        : 'text-red-500'
                    }`}
                  />
                  <div>
                    <p className="font-medium text-zinc-200">
                      {s.step}. {s.name}
                    </p>
                    <p className="text-zinc-500">{s.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2 bg-[#0E0E13] border border-zinc-800 rounded-xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                {bundle.files.map((f, idx) => (
                  <button
                    key={f.path}
                    type="button"
                    onClick={() => setSelectedConfigIdx(idx)}
                    className={`px-2.5 py-1 rounded text-xs font-mono cursor-pointer ${
                      selectedConfigIdx === idx
                        ? 'bg-red-600/20 text-white border border-red-600/50'
                        : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
                    }`}
                  >
                    {f.path}
                  </button>
                ))}
              </div>
              {activeCfg && (
                <button
                  type="button"
                  onClick={() => handleCopyFile(activeCfg.content)}
                  className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 flex items-center gap-1 cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  <span>Copiar</span>
                </button>
              )}
            </div>

            {activeCfg && (
              <pre className="bg-[#09090D] border border-zinc-800 rounded-lg p-4 text-xs font-mono text-zinc-200 overflow-x-auto max-h-80">
                {activeCfg.content}
              </pre>
            )}
          </div>
        </div>
      )}

      {deployLogs.length > 0 && (
        <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-4 space-y-2">
          <div className="text-xs font-semibold text-white">Logs da Última Publicação</div>
          <div className="bg-[#09090D] border border-zinc-800 rounded-lg p-3 space-y-1 font-mono text-xs text-zinc-300">
            {deployLogs.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        </div>
      )}

      {/* Deployment History & Rollback */}
      <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Cloud className="w-4 h-4 text-red-500" />
          <span>Histórico de Publicações & Rollback ({deployments.length})</span>
        </div>

        {deployments.length === 0 ? (
          <p className="text-xs text-zinc-500">Nenhuma publicação registrada ainda.</p>
        ) : (
          <div className="space-y-2">
            {deployments.map((dep) => (
              <div
                key={dep.id}
                className="p-3.5 rounded-lg bg-[#09090D] border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-white">{dep.projectName}</span>
                    <span className="text-[11px] font-mono text-zinc-400">
                      {dep.provider} · {dep.environment} · {dep.version}
                    </span>
                    <span
                      className={`text-[11px] font-mono px-2 py-0.5 rounded ${
                        dep.status === 'ONLINE'
                          ? 'bg-emerald-950/60 text-emerald-400'
                          : dep.status === 'FAILED'
                          ? 'bg-red-950/60 text-red-400'
                          : 'bg-zinc-900 text-zinc-300'
                      }`}
                    >
                      {dep.status}
                    </span>
                  </div>
                  {dep.logsSummary && (
                    <p className="text-xs text-zinc-500 truncate">{dep.logsSummary}</p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {dep.url && (
                    <a
                      href={dep.url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200 flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Abrir</span>
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      void updateDeploymentStatus({
                        deployId: dep.id,
                        status: 'ROLLING_BACK',
                        logsSummary: `Rollback solicitado para ${dep.version}.`,
                      }).then(() => notify('info', 'Rollback registrado', `Status de ${dep.projectName} marcado como ROLLING_BACK.`))
                    }
                    className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Rollback</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void updateDeploymentStatus({
                        deployId: dep.id,
                        status: 'SUSPENDED',
                        logsSummary: 'Serviço suspenso pelo administrador.',
                      }).then(() => notify('warning', 'Serviço suspenso', `${dep.projectName} marcado como SUSPENDED.`))
                    }
                    className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 flex items-center gap-1 cursor-pointer"
                  >
                    <PauseCircle className="w-3 h-3" />
                    <span>Suspender</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
