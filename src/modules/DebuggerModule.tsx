import { Bug, GitCompare, Loader2, Play, ShieldAlert } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useTitan } from '../contexts/TitanContext.tsx';
import { analyzeCode, executeInSandbox } from '../lib/titanApi.ts';
import { SUPPORTED_LANGUAGES } from '../shared/titanValidators.ts';

export function DebuggerModule() {
  const { notify } = useTitan();
  const [language, setLanguage] = useState('Python');
  const [code, setCode] = useState(
    `def calcular_media(valores):\n    unused_var = 42\n    if not valores:\n        raise ValueError("Lista vazia")\n    return sum(valores) / len(valores)\n\nprint("Média:", calcular_media([10, 20, 30]))`,
  );
  const [compareCode, setCompareCode] = useState('');
  const [showDiff, setShowDiff] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [running, setRunning] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{
    staticIssues: Array<{ line: number; severity: string; rule: string; message: string }>;
    unusedVars: string[];
    securityFindings: string[];
    aiReview?: string;
  } | null>(null);
  const [execOutput, setExecOutput] = useState<{
    executed: boolean;
    runtime: string;
    exitCode: number | null;
    stdout: string;
    stderr: string;
    durationMs: number;
    limitationReason?: string;
  } | null>(null);

  const handleAnalyze = async (useAi: boolean) => {
    if (!code.trim()) return;
    setAnalyzing(true);
    try {
      const res = await analyzeCode({ code, language, useAi });
      setAnalysisResult(res);
      notify('info', 'Análise concluída', `${res.staticIssues.length} apontamento(s) estático(s) encontrado(s).`);
    } catch (err) {
      notify('error', 'Erro na análise', err instanceof Error ? err.message : String(err));
    } finally {
      setAnalyzing(false);
    }
  };

  const handleRunIsolated = async () => {
    setRunning(true);
    try {
      const res = await executeInSandbox({ language, code, syntaxOnly: false });
      setExecOutput(res);
    } catch (err) {
      notify('error', 'Erro no sandbox', err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  const diffLines = useMemo(() => {
    if (!showDiff) return [];
    const a = code.split('\n');
    const b = compareCode.split('\n');
    const maxLen = Math.max(a.length, b.length);
    const rows: Array<{ line: number; left: string; right: string; changed: boolean }> = [];
    for (let i = 0; i < maxLen; i++) {
      const left = a[i] ?? '';
      const right = b[i] ?? '';
      rows.push({ line: i + 1, left, right, changed: left !== right });
    }
    return rows;
  }, [code, compareCode, showDiff]);

  return (
    <div className="space-y-6">
      <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-display text-xl font-bold text-white flex items-center gap-2">
              <Bug className="w-5 h-5 text-red-500" />
              TITAN Debugger Pro
            </h2>
            <p className="text-xs text-zinc-400">
              Análise estática, detecção de variáveis não utilizadas, auditoria de segurança, comparação de código e execução isolada.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="px-3 py-1.5 bg-[#070709] border border-zinc-800 rounded-md text-xs text-zinc-200"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowDiff((v) => !v)}
              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 rounded-md inline-flex items-center gap-1.5 cursor-pointer"
            >
              <GitCompare className="w-3.5 h-3.5" />
              {showDiff ? 'Ocultar Diff' : 'Comparar Código'}
            </button>
            <button
              type="button"
              onClick={() => void handleAnalyze(false)}
              disabled={analyzing}
              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 rounded-md cursor-pointer"
            >
              Análise Estática
            </button>
            <button
              type="button"
              onClick={() => void handleAnalyze(true)}
              disabled={analyzing}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-xs text-white font-medium rounded-md inline-flex items-center gap-1.5 cursor-pointer"
            >
              {analyzing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Diagnóstico + Correção IA
            </button>
            <button
              type="button"
              onClick={() => void handleRunIsolated()}
              disabled={running}
              className="px-3 py-1.5 bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold rounded-md inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              Executar Isolado
            </button>
          </div>
        </div>

        <div className={`grid gap-4 ${showDiff ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            rows={12}
            spellCheck={false}
            className="w-full p-4 bg-[#070709] border border-zinc-800 rounded-lg text-xs sm:text-sm font-mono text-zinc-100 focus:outline-none focus:border-red-600"
          />
          {showDiff && (
            <textarea
              value={compareCode}
              onChange={(e) => setCompareCode(e.target.value)}
              rows={12}
              spellCheck={false}
              placeholder="Cole a segunda versão do código para comparar linha a linha..."
              className="w-full p-4 bg-[#070709] border border-zinc-800 rounded-lg text-xs sm:text-sm font-mono text-zinc-100 focus:outline-none focus:border-red-600"
            />
          )}
        </div>
      </div>

      {showDiff && (
        <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-zinc-800 text-xs font-semibold text-zinc-300">
            Comparação Linha a Linha (Code Diff)
          </div>
          <div className="max-h-72 overflow-y-auto font-mono text-xs divide-y divide-zinc-900">
            {diffLines.map((row) => (
              <div
                key={row.line}
                className={`grid grid-cols-12 px-3 py-1 ${row.changed ? 'bg-red-950/25' : ''}`}
              >
                <span className="col-span-1 text-zinc-600 tabular-nums">{row.line}</span>
                <span className="col-span-5 text-zinc-300 pr-2 truncate">{row.left}</span>
                <span className="col-span-6 text-zinc-300 truncate">{row.right}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {execOutput && (
        <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-5 space-y-2 font-mono text-xs">
          <div className="flex flex-wrap items-center gap-4 text-zinc-400">
            <span>Runtime: {execOutput.runtime}</span>
            <span>Exit: {String(execOutput.exitCode)}</span>
            <span className="tabular-nums">{execOutput.durationMs}ms</span>
          </div>
          {execOutput.stdout && <pre className="text-emerald-300 whitespace-pre-wrap">{execOutput.stdout}</pre>}
          {execOutput.stderr && <pre className="text-red-400 whitespace-pre-wrap">{execOutput.stderr}</pre>}
          {execOutput.limitationReason && <p className="text-amber-300">{execOutput.limitationReason}</p>}
        </div>
      )}

      {analysisResult && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-5 space-y-4">
            <h3 className="font-display text-base font-semibold text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-500" />
              Relatório Estático & Segurança
            </h3>
            <div className="space-y-2 text-xs">
              <p className="text-zinc-400">
                Variáveis potencialmente não utilizadas:{' '}
                <span className="font-mono text-zinc-200">
                  {analysisResult.unusedVars.length > 0 ? analysisResult.unusedVars.join(', ') : 'Nenhuma detectada'}
                </span>
              </p>
              {analysisResult.staticIssues.length === 0 ? (
                <p className="text-emerald-400">Nenhum problema estático crítico identificado.</p>
              ) : (
                <div className="divide-y divide-zinc-800/70">
                  {analysisResult.staticIssues.map((issue, idx) => (
                    <div key={idx} className="py-2 space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-red-400">
                          Linha {issue.line} · {issue.rule}
                        </span>
                        <span className="uppercase text-[10px] text-zinc-400">{issue.severity}</span>
                      </div>
                      <p className="text-zinc-300">{issue.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-5 space-y-3">
            <h3 className="font-display text-base font-semibold text-white">
              Sugestões de Correção
            </h3>
            {analysisResult.aiReview ? (
              <pre className="text-xs text-zinc-200 whitespace-pre-wrap break-words font-sans leading-relaxed max-h-[380px] overflow-y-auto">
                {analysisResult.aiReview}
              </pre>
            ) : (
              <p className="text-xs text-zinc-500">
                Clique em "Diagnóstico + Correção IA" para análise detalhada com sugestões de refatoração.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
