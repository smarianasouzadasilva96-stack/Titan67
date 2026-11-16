import { AlertTriangle, CheckCircle2, HeartPulse, ShieldAlert, Sparkles, Wrench } from 'lucide-react';
import { useState } from 'react';
import { useTitan } from '../contexts/TitanContext.tsx';
import { runSelfHealing } from '../lib/titanApi.ts';
import { addOrUpdateProjectFile, createProjectBackup, writeAuditLog } from '../lib/workspaceService.ts';
import type { SelfHealingReport } from '../shared/titanTypes.ts';

export function QualityEngineModule() {
  const { user, projects, selectedProjectId, setSelectedProjectId, selectedProjectFiles, notify } = useTitan();
  const [report, setReport] = useState<SelfHealingReport | null>(null);
  const [running, setRunning] = useState(false);
  const [useAiFix, setUseAiFix] = useState(false);

  const activeProject = projects.find((p) => p.id === selectedProjectId) || null;

  const handleRunDiagnostic = async (applySafeFixes: boolean) => {
    if (!user || !activeProject) {
      notify('warning', 'Nenhum projeto selecionado', 'Selecione ou crie um projeto no Workspace para auditar.');
      return;
    }
    setRunning(true);
    try {
      let backupInfo = '';
      if (applySafeFixes && selectedProjectFiles.length > 0) {
        const bkp = await createProjectBackup({
          ownerId: user.uid,
          projectId: activeProject.id,
          projectName: activeProject.name,
          label: `Pré-AutoFix (${new Date().toLocaleTimeString()})`,
          files: selectedProjectFiles.map((f) => ({
            path: f.path,
            content: f.content,
            language: f.language,
            fileKind: f.fileKind,
          })),
        });
        backupInfo = bkp.backupId;
      }

      const res = await runSelfHealing({
        files: selectedProjectFiles.map((f) => ({
          path: f.path,
          content: f.content,
          language: f.language,
          fileKind: f.fileKind,
        })),
        applySafeFixes,
        useAiFix,
      });

      if (applySafeFixes && res.fixedFiles && res.fixedFiles.length > 0) {
        for (const fixed of res.fixedFiles) {
          const orig = selectedProjectFiles.find((f) => f.path === fixed.path);
          if (orig) {
            await addOrUpdateProjectFile({
              projectId: activeProject.id,
              ownerId: user.uid,
              fileId: orig.id,
              path: orig.path,
              content: fixed.content,
              language: orig.language,
              fileKind: orig.fileKind,
              currentVersion: orig.version,
            });
          }
        }
        await writeAuditLog({
          actorId: user.uid,
          module: 'quality-engine',
          action: 'self_healing_applied',
          severity: 'info',
          detail: `Self-Healing aplicou correções em ${res.fixedFiles.length} arquivo(s) de ${activeProject.name}. Backup prévio: ${backupInfo}.`,
        });
        notify('success', 'Correções aplicadas com backup', `${res.fixedFiles.length} arquivo(s) recuperado(s) com backup ${backupInfo}.`);
      } else {
        notify('info', 'Diagnóstico concluído', `${res.findings.length} achado(s) identificado(s).`);
      }

      setReport(res);
    } catch (err) {
      notify('error', 'Falha no Quality Engine', err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white tracking-tight">
            TITAN Quality & Self-Healing Engine
          </h1>
          <p className="text-sm text-zinc-400">
            Ciclo completo: Detecção, Diagnóstico, Causa Raiz, Proposta Segura, Validação e Recuperação com backup automático.
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

          <label className="px-3 py-2 bg-[#0E0E13] border border-zinc-800 rounded-lg text-xs text-zinc-300 flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={useAiFix}
              onChange={(e) => setUseAiFix(e.target.checked)}
              className="accent-red-600"
            />
            <span>Permitir Auto-Fix IA</span>
          </label>

          <button
            type="button"
            onClick={() => void handleRunDiagnostic(false)}
            disabled={running || !activeProject}
            className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 border border-zinc-700 text-zinc-200 text-xs font-medium rounded-lg flex items-center gap-1.5 cursor-pointer"
          >
            <HeartPulse className="w-3.5 h-3.5 text-red-500" />
            <span>Diagnosticar</span>
          </button>

          <button
            type="button"
            onClick={() => void handleRunDiagnostic(true)}
            disabled={running || !activeProject}
            className="px-3 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg flex items-center gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Auto-Curar Seguro</span>
          </button>
        </div>
      </div>

      {!report ? (
        <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-8 text-center space-y-2">
          <Wrench className="w-8 h-8 text-zinc-600 mx-auto" />
          <p className="text-sm font-medium text-zinc-200">
            Pronto para auditar o projeto ativo
          </p>
          <p className="text-xs text-zinc-500 max-w-lg mx-auto">
            O Quality Engine verifica completude, stubs proibidos, sintaxe multi-linguagem, compiladores locais, imports relativos e exposição de segredos. Antes de qualquer correção automática, um backup SHA-256 é gravado no Firestore.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* 6 Stages */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {report.stages.map((st) => (
              <div key={st.stage} className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-4 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-200">{st.stage}</span>
                  <span
                    className={`text-[11px] font-mono px-2 py-0.5 rounded ${
                      st.status === 'OK' || st.status === 'FIXED'
                        ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/50'
                        : st.status === 'BLOCKED'
                        ? 'bg-red-950/60 text-red-400 border border-red-800/50'
                        : 'bg-amber-950/60 text-amber-400 border border-amber-800/50'
                    }`}
                  >
                    {st.status}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">{st.summary}</p>
              </div>
            ))}
          </div>

          {/* Findings */}
          <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">
                Anomalias & Diagnósticos ({report.findings.length})
              </h2>
              <span className="text-xs text-zinc-500 font-mono">
                {new Date(report.executedAt).toLocaleString()}
              </span>
            </div>

            {report.findings.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-emerald-400 py-3">
                <CheckCircle2 className="w-4 h-4" />
                <span>Nenhuma falha sintática, estrutural ou de integridade detectada neste projeto.</span>
              </div>
            ) : (
              <div className="space-y-2.5">
                {report.findings.map((f) => (
                  <div
                    key={f.id}
                    className="p-3.5 rounded-lg bg-[#09090D] border border-zinc-800/90 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {f.severity === 'critical' || f.severity === 'error' ? (
                          <ShieldAlert className="w-4 h-4 text-red-500 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        )}
                        <span className="text-xs font-semibold text-zinc-100">{f.title}</span>
                      </div>
                      <span className="text-[11px] font-mono text-zinc-400">
                        {f.fixed ? 'RECUPERADO' : f.requiresAdminApproval ? 'REQUER ADMIN' : f.severity.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400">{f.detail}</p>
                    <p className="text-[11px] text-zinc-500">
                      Ação recomendada: {f.proposedAction}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
