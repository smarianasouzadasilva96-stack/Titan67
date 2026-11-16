import { Lock, Shield, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useTitan } from '../contexts/TitanContext.tsx';
import { runSecurityScan } from '../lib/titanApi.ts';
import type { SecurityFinding } from '../shared/titanTypes.ts';

export function SecurityCenterModule() {
  const { projects, selectedProjectId, setSelectedProjectId, selectedProjectFiles, auditLogs, notify } = useTitan();
  const [findings, setFindings] = useState<SecurityFinding[] | null>(null);
  const [scannedCount, setScannedCount] = useState(0);
  const [scanning, setScanning] = useState(false);

  const activeProject = projects.find((p) => p.id === selectedProjectId) || null;

  const handleScan = async () => {
    setScanning(true);
    try {
      const res = await runSecurityScan(
        selectedProjectFiles.map((f) => ({ path: f.path, content: f.content })),
      );
      setFindings(res.findings);
      setScannedCount(res.scannedFiles);
      notify('info', 'Auditoria concluída', `${res.scannedFiles} arquivo(s) escaneado(s).`);
    } catch (err) {
      notify('error', 'Erro no scanner', err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white tracking-tight">
            TITAN Security Center
          </h1>
          <p className="text-sm text-zinc-400">
            Detecção de vazamento de segredos, riscos de injeção/XSS, transporte TLS, auditoria RBAC e histórico de acesso.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
                  {p.name} ({p.filesCount} arq.)
                </option>
              ))
            )}
          </select>

          <button
            type="button"
            onClick={() => void handleScan()}
            disabled={scanning}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"
          >
            <Shield className="w-3.5 h-3.5" />
            <span>{scanning ? 'Escaneando...' : 'Executar Auditoria'}</span>
          </button>
        </div>
      </div>

      {/* Platform Security Controls Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-4 space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-white">
            <Lock className="w-4 h-4 text-emerald-400" />
            <span>Cofre AES-256-GCM</span>
          </div>
          <p className="text-xs text-zinc-400">
            Tokens de provedores e hospedagens cifrados exclusivamente no servidor; nunca retornados ao navegador.
          </p>
        </div>
        <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-4 space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-white">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>SSRF Guard & RBAC</span>
          </div>
          <p className="text-xs text-zinc-400">
            Proxy HTTP e verificador DNS bloqueiam redes privadas; regras Firestore restringem por ownerId e Admin verificado.
          </p>
        </div>
        <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-4 space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-white">
            <ShieldAlert className="w-4 h-4 text-red-500" />
            <span>Projeto Alvo</span>
          </div>
          <p className="text-xs text-zinc-400">
            {activeProject ? `${activeProject.name} (${scannedCount || selectedProjectFiles.length} arquivos)` : 'Nenhum projeto selecionado'}
          </p>
        </div>
      </div>

      {findings && (
        <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-white">
            Achados de Segurança ({findings.length})
          </h2>
          <div className="space-y-2">
            {findings.map((f) => (
              <div key={f.id} className="p-3.5 rounded-lg bg-[#09090D] border border-zinc-800 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-white">{f.title}</span>
                  <span
                    className={`text-[11px] font-mono px-2 py-0.5 rounded ${
                      f.severity === 'CRITICAL' || f.severity === 'HIGH'
                        ? 'bg-red-950/60 text-red-400'
                        : f.severity === 'MEDIUM'
                        ? 'bg-amber-950/60 text-amber-400'
                        : 'bg-emerald-950/60 text-emerald-400'
                    }`}
                  >
                    {f.severity}
                  </span>
                </div>
                <p className="text-xs font-mono text-zinc-400">
                  {f.filePath}{f.line ? `:${f.line}` : ''} · {f.category}
                </p>
                <p className="text-xs text-zinc-400">{f.recommendation}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Audit Logs */}
      <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-white">Logs de Auditoria de Segurança</h2>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {auditLogs.slice(0, 15).map((log) => (
            <div key={log.id} className="p-2.5 rounded-lg bg-[#09090D] border border-zinc-800 text-xs flex items-center justify-between gap-3">
              <div className="truncate">
                <span className="font-mono text-red-400 mr-2">{log.action}</span>
                <span className="text-zinc-300">{log.detail}</span>
              </div>
              <span className="font-mono text-[11px] text-zinc-500 uppercase shrink-0">{log.severity}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
