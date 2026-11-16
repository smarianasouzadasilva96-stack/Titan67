import JSZip from 'jszip';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  FileCode2,
  FolderPlus,
  Play,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import React, { useState } from 'react';
import { useTitan } from '../contexts/TitanContext.tsx';
import { executeInSandbox } from '../lib/titanApi.ts';
import { saveProjectToWorkspace, writeAuditLog } from '../lib/workspaceService.ts';
import type { GenerationResult } from '../shared/titanTypes.ts';

export function PipelineResultPanel({
  result,
  projectNameSuggestion,
}: {
  result: GenerationResult;
  projectNameSuggestion?: string;
}) {
  const { user, notify, setSelectedProjectId, setActiveNav } = useTitan();
  const [activeFileIdx, setActiveFileIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [runningSandbox, setRunningSandbox] = useState(false);
  const [stdinInput, setStdinInput] = useState('');
  const [sandboxOutput, setSandboxOutput] = useState<{
    executed: boolean;
    runtime: string;
    exitCode: number | null;
    stdout: string;
    stderr: string;
    durationMs: number;
    limitationReason?: string;
  } | null>(result.executionEvidence || null);

  const activeFile = result.files[activeFileIdx] || result.files[0];

  const handleCopy = async () => {
    if (!activeFile) return;
    await navigator.clipboard.writeText(activeFile.content);
    notify('success', 'Copiado', `${activeFile.path} copiado para a área de transferência.`);
  };

  const handleDownloadSingle = () => {
    if (!activeFile) return;
    const blob = new Blob([activeFile.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeFile.path.split('/').pop() || 'script.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadZip = async () => {
    const zip = new JSZip();
    for (const file of result.files) {
      zip.file(file.path, file.content);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(projectNameSuggestion || 'titan-project').toLowerCase().replace(/[^a-z0-9-_]+/g, '-')}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveWorkspace = async () => {
    if (!user || result.files.length === 0) return;
    setSaving(true);
    try {
      const projId = await saveProjectToWorkspace({
        ownerId: user.uid,
        name:
          projectNameSuggestion ||
          `${result.plan.language} — ${result.plan.objective.slice(0, 48)}`,
        description: result.plan.architecture,
        projectType:
          result.plan.environment === 'Android'
            ? 'android'
            : result.plan.language === 'Luau'
            ? 'luau'
            : result.plan.language === 'HTML'
            ? 'web'
            : result.files.length === 1
            ? 'single-file'
            : 'fullstack',
        language: result.plan.language,
        environment: result.plan.environment,
        status: result.status,
        files: result.files,
      });
      await writeAuditLog({
        actorId: user.uid,
        module: 'workspace',
        action: 'save_generated_project',
        severity: 'info',
        detail: `Projeto ${projId} salvo com ${result.files.length} arquivo(s) (${result.plan.language}).`,
      });
      setSelectedProjectId(projId);
      notify('success', 'Salvo no Workspace', 'Projeto persistido no Firestore com todos os arquivos.');
    } catch (err) {
      notify('error', 'Erro ao salvar', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleRunSandbox = async () => {
    if (!activeFile) return;
    setRunningSandbox(true);
    try {
      const exec = await executeInSandbox({
        language: activeFile.language,
        code: activeFile.content,
        stdin: stdinInput,
        syntaxOnly: false,
      });
      setSandboxOutput(exec);
    } catch (err) {
      notify('error', 'Erro no sandbox', err instanceof Error ? err.message : String(err));
    } finally {
      setRunningSandbox(false);
    }
  };

  const canRunInSandbox =
    activeFile &&
    ['python', 'javascript', 'typescript', 'tsx', 'jsx', 'sql', 'json', 'yaml', 'bash', 'shell', 'perl', 'js', 'ts', 'py'].includes(
      activeFile.language.toLowerCase(),
    );

  return (
    <div className="space-y-6">
      {/* Status & Plan Summary */}
      <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
              <span>Tarefa {result.taskId}</span>
              <span aria-hidden="true">·</span>
              <span>{result.plan.language}</span>
              <span aria-hidden="true">·</span>
              <span>{result.plan.environment}</span>
              <span aria-hidden="true">·</span>
              <span>
                {result.plan.deliveryMode === 'single-file' ? 'Arquivo Único' : `${result.files.length} Arquivos`}
              </span>
              {result.repairAttempts > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">Autocorreções: {result.repairAttempts}</span>
                </>
              )}
            </div>
            <h3 className="font-display text-lg font-semibold text-white">
              {result.plan.objective}
            </h3>
          </div>

          <div className="flex items-center gap-2">
            {result.status === 'COMPLETED' ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                COMPLETED
              </span>
            ) : result.status === 'BLOCKED' ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400">
                <ShieldAlert className="w-4 h-4" />
                BLOCKED
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-400">
                <XCircle className="w-4 h-4" />
                {result.status}
              </span>
            )}
          </div>
        </div>

        <p className="text-sm text-zinc-300 leading-relaxed">{result.explanation}</p>

        {result.plan.singleFileReason && (
          <p className="text-xs text-zinc-400">
            Single-File Intelligence: {result.plan.singleFileReason}
          </p>
        )}

        {result.limitations && result.limitations.length > 0 && (
          <div className="bg-amber-950/25 border border-amber-800/50 rounded-lg p-3.5 space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Limitações explícitas do ambiente</span>
            </div>
            {result.limitations.map((lim, i) => (
              <p key={i} className="text-xs text-amber-200/90 leading-relaxed">
                {lim}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Code Viewer & Actions */}
      {result.files.length > 0 && activeFile && (
        <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl overflow-hidden">
          <div className="border-b border-zinc-800 px-4 py-3 flex flex-wrap items-center justify-between gap-3 bg-[#101016]">
            <div className="flex items-center gap-1.5 overflow-x-auto max-w-full">
              {result.files.map((file, idx) => (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => setActiveFileIdx(idx)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono whitespace-nowrap transition-colors cursor-pointer ${
                    idx === activeFileIdx
                      ? 'bg-red-600/20 text-white border border-red-600/50'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-transparent'
                  }`}
                >
                  <FileCode2 className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  <span>{file.path}</span>
                  <span className="text-[10px] text-zinc-500">({file.fileKind})</span>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-medium rounded-md inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                Copiar
              </button>
              <button
                type="button"
                onClick={handleDownloadSingle}
                className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-medium rounded-md inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Arquivo
              </button>
              {result.files.length > 1 && (
                <button
                  type="button"
                  onClick={() => void handleDownloadZip()}
                  className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-medium rounded-md inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Exportar ZIP
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleSaveWorkspace()}
                disabled={saving}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-medium rounded-md inline-flex items-center gap-1.5 cursor-pointer"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                {saving ? 'Salvando...' : 'Salvar no Workspace'}
              </button>
              <button
                type="button"
                onClick={() => setActiveNav('workspace')}
                className="px-3 py-1.5 text-zinc-400 hover:text-white text-xs font-medium cursor-pointer"
              >
                Abrir Workspace
              </button>
            </div>
          </div>

          <pre className="p-4 overflow-x-auto text-xs sm:text-sm font-mono text-zinc-200 leading-relaxed max-h-[540px] bg-[#08080B]">
            <code>{activeFile.content}</code>
          </pre>

          {canRunInSandbox && (
            <div className="border-t border-zinc-800 p-4 bg-[#0D0D12] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs font-medium text-zinc-300">
                  Sandbox de Execução Isolada ({activeFile.language})
                </span>
                <button
                  type="button"
                  onClick={() => void handleRunSandbox()}
                  disabled={runningSandbox}
                  className="px-3.5 py-1.5 bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold rounded-md inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  {runningSandbox ? 'Executando...' : 'Executar Código'}
                </button>
              </div>
              <input
                type="text"
                value={stdinInput}
                onChange={(e) => setStdinInput(e.target.value)}
                placeholder="Entrada padrão (stdin) opcional para scripts interativos..."
                className="w-full px-3 py-2 bg-[#070709] border border-zinc-800 rounded-md text-xs font-mono text-zinc-200 focus:outline-none focus:border-red-600"
              />
              {sandboxOutput && (
                <div className="bg-[#070709] border border-zinc-800 rounded-lg p-3 space-y-1.5 font-mono text-xs">
                  <div className="flex flex-wrap items-center gap-3 text-zinc-400">
                    <span>Runtime: {sandboxOutput.runtime}</span>
                    <span>Exit Code: {String(sandboxOutput.exitCode)}</span>
                    <span className="tabular-nums">Tempo: {sandboxOutput.durationMs}ms</span>
                  </div>
                  {sandboxOutput.stdout && (
                    <pre className="text-emerald-300 whitespace-pre-wrap break-words">
                      {sandboxOutput.stdout}
                    </pre>
                  )}
                  {sandboxOutput.stderr && (
                    <pre className="text-red-400 whitespace-pre-wrap break-words">
                      {sandboxOutput.stderr}
                    </pre>
                  )}
                  {sandboxOutput.limitationReason && (
                    <p className="text-amber-300">{sandboxOutput.limitationReason}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 10 Independent Validators & Pipeline Audit */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-5 space-y-3">
          <h4 className="font-display text-sm font-semibold text-white">
            Validadores Independentes ({result.validators.length})
          </h4>
          <div className="divide-y divide-zinc-800/70">
            {result.validators.map((v) => (
              <div key={v.name} className="py-2.5 flex items-start justify-between gap-3">
                <div className="space-y-0.5 min-w-0">
                  <p className="text-xs font-medium text-zinc-200">{v.name}</p>
                  <p className="text-xs text-zinc-400 break-words">{v.message}</p>
                  {v.details && v.details.length > 0 && (
                    <ul className="pt-1 space-y-0.5 text-[11px] text-red-400">
                      {v.details.map((d, idx) => (
                        <li key={idx}>• {d}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <span
                  className={`text-xs font-medium whitespace-nowrap shrink-0 ${
                    v.severity === 'pass'
                      ? 'text-emerald-400'
                      : v.severity === 'warning' || v.severity === 'blocked'
                      ? 'text-amber-400'
                      : 'text-red-400'
                  }`}
                >
                  {v.passed ? (v.executed ? 'Aprovado' : 'Pendente') : 'Reprovado'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-5 space-y-3">
          <h4 className="font-display text-sm font-semibold text-white">
            Fluxo de Estados da Tarefa
          </h4>
          <div className="space-y-2.5">
            {result.pipelineLogs.map((log, i) => (
              <div
                key={i}
                className="flex items-start gap-3 text-xs border-b border-zinc-800/60 pb-2 last:border-0"
              >
                <span className="font-mono text-zinc-500 tabular-nums shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString('pt-BR')}
                </span>
                <span className="font-mono font-semibold text-red-400 shrink-0">
                  {log.state}
                </span>
                <span className="text-zinc-300 break-words">{log.detail}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
