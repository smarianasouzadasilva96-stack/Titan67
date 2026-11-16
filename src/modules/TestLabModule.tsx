import { CheckCircle2, FlaskConical, Play, ShieldAlert, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useTitan } from '../contexts/TitanContext.tsx';
import { runServerTestSuite, runTestLab } from '../lib/titanApi.ts';
import type { TestLabReport } from '../shared/titanTypes.ts';

export function TestLabModule() {
  const { isAdmin, selectedProjectFiles, notify } = useTitan();
  const [report, setReport] = useState<TestLabReport | null>(null);
  const [aiSuiteResults, setAiSuiteResults] = useState<Awaited<ReturnType<typeof runServerTestSuite>> | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRunDeterministicTests = async () => {
    setLoading(true);
    try {
      const res = await runTestLab(
        selectedProjectFiles.map((f) => ({
          path: f.path,
          content: f.content,
          language: f.language,
          fileKind: f.fileKind,
        })),
      );
      setReport(res);
      notify(
        res.failedCount === 0 ? 'success' : 'error',
        'Test Lab Concluído',
        `PASSED: ${res.passedCount} | FAILED: ${res.failedCount} | NOT_EXECUTED: ${res.notExecutedCount}`,
      );
    } catch (err) {
      notify('error', 'Erro no Test Lab', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleRunAiAcceptanceSuite = async () => {
    setLoading(true);
    try {
      const res = await runServerTestSuite();
      setAiSuiteResults(res);
      notify('success', 'Suíte de Geração IA concluída', `${res.results.length} cenários avaliados.`);
    } catch (err) {
      notify('error', 'Erro na suíte IA', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white tracking-tight">
            TITAN Test Lab
          </h1>
          <p className="text-sm text-zinc-400">
            Execução real de testes unitários, regressão, sandbox e auditoria estática com marcação estrita PASSED, FAILED ou NOT_EXECUTED.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleRunDeterministicTests()}
            disabled={loading}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Executar Testes Reais</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => void handleRunAiAcceptanceSuite()}
              disabled={loading}
              className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 border border-zinc-700 text-zinc-200 text-xs font-medium rounded-lg flex items-center gap-1.5 cursor-pointer"
            >
              <FlaskConical className="w-3.5 h-3.5 text-red-500" />
              <span>Suíte Completa IA (Admin)</span>
            </button>
          )}
        </div>
      </div>

      {report && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-4">
              <div className="text-xs text-zinc-400">PASSED</div>
              <div className="font-mono text-2xl font-bold text-emerald-400 tabular-nums">{report.passedCount}</div>
            </div>
            <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-4">
              <div className="text-xs text-zinc-400">FAILED</div>
              <div className="font-mono text-2xl font-bold text-red-500 tabular-nums">{report.failedCount}</div>
            </div>
            <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-4">
              <div className="text-xs text-zinc-400">NOT_EXECUTED</div>
              <div className="font-mono text-2xl font-bold text-amber-400 tabular-nums">{report.notExecutedCount}</div>
            </div>
          </div>

          <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl divide-y divide-zinc-800/80">
            {report.tests.map((t) => (
              <div key={t.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {t.status === 'PASSED' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : t.status === 'FAILED' ? (
                      <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                    ) : (
                      <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                    )}
                    <span className="text-xs font-semibold text-white">{t.name}</span>
                  </div>
                  <p className="text-xs font-mono text-zinc-400">{t.evidence}</p>
                </div>
                <div className="text-xs font-mono text-zinc-400 shrink-0">
                  {t.status} · {t.durationMs}ms
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {aiSuiteResults && (
        <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-5 space-y-3">
          <div className="text-sm font-semibold text-white">
            Resultados da Suíte End-to-End com IA ({aiSuiteResults.results.length})
          </div>
          <div className="space-y-2">
            {aiSuiteResults.results.map((r) => (
              <div key={r.id} className="p-3 rounded-lg bg-[#09090D] border border-zinc-800 flex items-center justify-between text-xs">
                <div>
                  <div className="font-semibold text-zinc-100">{r.name}</div>
                  <div className="text-zinc-500">
                    {r.language} ({r.environment}) · {r.filesCount} arquivo(s)
                  </div>
                </div>
                <span className="font-mono text-emerald-400">{r.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
