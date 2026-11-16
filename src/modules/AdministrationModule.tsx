import {
  Activity,
  BookOpen,
  CheckCircle2,
  Cpu,
  FlaskConical,
  Loader2,
  Plus,
  RotateCcw,
  Send,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTitan } from '../contexts/TitanContext.tsx';
import {
  fetchNeuralMemory,
  fetchNeuralStatus,
  learnNeuralMemory,
  rollbackNeuralMemory,
  runServerTestSuite,
  sendAiChat,
  trainNeuralModel,
} from '../lib/titanApi.ts';
import {
  createAdminKnowledgeEntry,
  deleteAdminKnowledgeEntry,
} from '../lib/workspaceService.ts';
import type {
  GenerationResult,
  MemorySnapshotSummary,
  NeuralModelStatus,
} from '../shared/titanTypes.ts';

export function AdministrationModule() {
  const {
    user,
    isAdmin,
    capabilities,
    projects,
    tasks,
    auditLogs,
    adminKnowledge,
    notify,
  } = useTitan();

  const [kbTitle, setKbTitle] = useState('');
  const [kbCategory, setKbCategory] = useState('Procedimento');
  const [kbContent, setKbContent] = useState('');

  const [adminPrompt, setAdminPrompt] = useState('');
  const [adminHistory, setAdminHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [chatLoading, setChatLoading] = useState(false);

  const [testingSuite, setTestingSuite] = useState(false);
  const [suiteResults, setSuiteResults] = useState<Array<{
    id: string;
    name: string;
    status: string;
    language: string;
    environment: string;
    filesCount: number;
    validators: GenerationResult['validators'];
    limitations?: string[];
  }> | null>(null);

  // Neural Core Admin State
  const [neuralModel, setNeuralModel] = useState<NeuralModelStatus | null>(null);
  const [memVersion, setMemVersion] = useState(1);
  const [snapshots, setSnapshots] = useState<MemorySnapshotSummary[]>([]);
  const [trainingBusy, setTrainingBusy] = useState(false);
  const [lastTrainReport, setLastTrainReport] = useState<string | null>(null);

  const loadNeuralAdminData = useCallback(async () => {
    try {
      const [statusRes, memRes] = await Promise.all([fetchNeuralStatus(), fetchNeuralMemory()]);
      setNeuralModel(statusRes.model);
      setMemVersion(memRes.currentVersion);
      setSnapshots(memRes.snapshots);
    } catch {
      // Ignore if unauthenticated during mount
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      void loadNeuralAdminData();
    }
  }, [isAdmin, loadNeuralAdminData]);

  const handleTeachAdminAi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !isAdmin || !kbTitle.trim() || !kbContent.trim()) return;
    await createAdminKnowledgeEntry({
      authorId: user.uid,
      title: kbTitle.trim(),
      category: kbCategory,
      content: kbContent.trim(),
    });
    // Also commit validated rule into TITAN Neural Core server memory!
    await learnNeuralMemory({
      kind: 'admin-rule',
      language: 'General',
      title: kbTitle.trim(),
      content: kbContent.trim(),
      tags: ['admin', kbCategory.toLowerCase()],
    });
    setKbTitle('');
    setKbContent('');
    await loadNeuralAdminData();
    notify('success', 'Conhecimento registrado', 'TITAN ADMIN AI atualizou a base persistente e o snapshot de memória.');
  };

  const handleAskAdminAi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminPrompt.trim() || !isAdmin) return;
    const msg = adminPrompt.trim();
    setAdminPrompt('');
    setAdminHistory((prev) => [...prev, { role: 'user', content: msg }]);
    setChatLoading(true);
    try {
      const summary = `Projetos: ${projects.length} | Tarefas: ${tasks.length} | Logs recentes: ${auditLogs.slice(0, 8).map((l) => `[${l.severity}] ${l.module}:${l.action}`).join(', ')} | Capabilities: Node=${capabilities?.nodeVersion}, Python=${String(capabilities?.pythonAvailable)}, AndroidSDK=${String(capabilities?.androidSdkAvailable)}`;
      const res = await sendAiChat({
        mode: 'admin-ai',
        message: msg,
        history: adminHistory,
        adminKnowledge: adminKnowledge.map((k) => ({
          title: k.title,
          category: k.category,
          content: k.content,
        })),
        systemMetricsSummary: summary,
      });
      setAdminHistory((prev) => [...prev, { role: 'assistant', content: res.reply }]);
    } catch (err) {
      notify('error', 'Erro Admin AI', err instanceof Error ? err.message : String(err));
    } finally {
      setChatLoading(false);
    }
  };

  const handleTrainNeural = async () => {
    setTrainingBusy(true);
    try {
      const res = await trainNeuralModel({ epochs: 3, learningRate: 0.01 });
      setNeuralModel(res.model);
      setLastTrainReport(
        `Treino concluído (${res.metrics.epochsRan} épocas, ${res.metrics.stepsExecuted} steps em ${res.metrics.durationMs}ms): Loss ${res.metrics.lossBefore} → ${res.metrics.lossAfter} | Perplexity ${res.metrics.perplexityBefore} → ${res.metrics.perplexityAfter} | Checkpoint ${res.metrics.checkpointChecksum}`,
      );
      await loadNeuralAdminData();
      notify('success', 'Treino Neural Concluído', `Loss reduzido para ${res.metrics.lossAfter}.`);
    } catch (err) {
      notify('error', 'Erro no treinamento', err instanceof Error ? err.message : String(err));
    } finally {
      setTrainingBusy(false);
    }
  };

  const handleRollbackSnapshot = async (versionId: string) => {
    try {
      const res = await rollbackNeuralMemory(versionId);
      await loadNeuralAdminData();
      notify('success', 'Rollback concluído', `Memória revertida (${res.restoredEntries} entradas, v${res.version}).`);
    } catch (err) {
      notify('error', 'Erro no rollback', err instanceof Error ? err.message : String(err));
    }
  };

  const handleRunTestSuite = async () => {
    setTestingSuite(true);
    try {
      const res = await runServerTestSuite();
      setSuiteResults(res.results);
      notify('success', 'Suíte de testes executada', `${res.results.length} cenários verificados no servidor.`);
    } catch (err) {
      notify('error', 'Falha na suíte de testes', err instanceof Error ? err.message : String(err));
    } finally {
      setTestingSuite(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Security Center & Role Status */}
      <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-display text-xl font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-red-500" />
              TITAN Administration & Security Center
            </h2>
            <p className="text-xs text-zinc-400">
              Governança administrativa, TITAN ADMIN AI autônoma, treinamento do Neural Core, snapshots de memória e suíte de testes.
            </p>
          </div>
          <span className="text-xs font-mono text-zinc-300">
            Perfil verificado: {isAdmin ? 'ADMIN' : 'ENGINEER (Somente Leitura)'}
          </span>
        </div>

        {!isAdmin && (
          <div className="bg-amber-950/25 border border-amber-800/50 rounded-lg p-4 text-xs text-amber-200">
            Controles exclusivos de administrador (TITAN ADMIN AI, Treino do Neural Core, Rollback de Memória e Suíte de Testes) exigem autenticação verificada como administrador no backend e nas Firestore Rules.
          </div>
        )}
      </div>

      {isAdmin && (
        <>
          {/* TITAN Neural Core Trainer & Memory Rollback */}
          <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="font-display text-base font-semibold text-white flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-red-500" />
                  TITAN Neural Core · Treinamento Real & Memória Versionada (v{memVersion})
                </h3>
                <p className="text-xs text-zinc-400">
                  Treine épocas adicionais do Transformer Causal em TypeScript no corpus técnico + reparos validados, ou reverta snapshots de memória.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleTrainNeural()}
                disabled={trainingBusy}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg inline-flex items-center gap-2 cursor-pointer"
              >
                {trainingBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
                {trainingBusy ? 'Treinando Épocas...' : 'Treinar 3 Épocas + Salvar Checkpoint'}
              </button>
            </div>

            {neuralModel && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                <div className="bg-[#070709] border border-zinc-800 rounded-lg p-3">
                  <div className="text-zinc-500 text-[11px]">Parâmetros</div>
                  <div className="text-white font-semibold">{neuralModel.parameterCount.toLocaleString('en-US')}</div>
                </div>
                <div className="bg-[#070709] border border-zinc-800 rounded-lg p-3">
                  <div className="text-zinc-500 text-[11px]">Loss Inicial → Atual</div>
                  <div className="text-emerald-400 font-semibold">{neuralModel.initialLoss} → {neuralModel.currentLoss}</div>
                </div>
                <div className="bg-[#070709] border border-zinc-800 rounded-lg p-3">
                  <div className="text-zinc-500 text-[11px]">Perplexity</div>
                  <div className="text-white font-semibold">{neuralModel.perplexity}</div>
                </div>
                <div className="bg-[#070709] border border-zinc-800 rounded-lg p-3">
                  <div className="text-zinc-500 text-[11px]">Steps / Épocas</div>
                  <div className="text-white font-semibold">{neuralModel.trainingSteps} / {neuralModel.epochsCompleted}</div>
                </div>
              </div>
            )}

            {lastTrainReport && (
              <p className="text-xs font-mono text-emerald-400 bg-emerald-950/20 border border-emerald-900/40 rounded-lg px-3 py-2">
                {lastTrainReport}
              </p>
            )}

            {snapshots.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-zinc-400">
                  Snapshots Disponíveis para Rollback Seguro ({snapshots.length}):
                </div>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {snapshots.map((snap) => (
                    <div key={snap.versionId} className="flex items-center justify-between gap-2 bg-[#070709] border border-zinc-800 rounded-lg px-3 py-2 text-xs">
                      <div className="truncate">
                        <span className="font-mono text-red-400 mr-2">{snap.versionId}</span>
                        <span className="text-zinc-300">{snap.reason}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleRollbackSnapshot(snap.versionId)}
                        className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 rounded inline-flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Reverter
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* TITAN ADMIN AI + Knowledge Base */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-5 flex flex-col justify-between gap-4">
              <div className="space-y-3">
                <h3 className="font-display text-base font-semibold text-white">
                  TITAN ADMIN AI (Autônoma)
                </h3>
                <div className="h-72 overflow-y-auto space-y-3 bg-[#070709] border border-zinc-800 rounded-lg p-3">
                  {adminHistory.length === 0 ? (
                    <p className="text-xs text-zinc-500">
                      Consulte estado do servidor, métricas do Neural Core, logs, falhas ou procedimentos administrativos registrados.
                    </p>
                  ) : (
                    adminHistory.map((m, i) => (
                      <div key={i} className={`text-xs whitespace-pre-wrap ${m.role === 'user' ? 'text-red-300 font-medium' : 'text-zinc-200'}`}>
                        <span className="font-mono text-zinc-500 mr-2">[{m.role}]</span>
                        {m.content}
                      </div>
                    ))
                  )}
                </div>
              </div>
              <form onSubmit={handleAskAdminAi} className="flex gap-2">
                <input
                  type="text"
                  value={adminPrompt}
                  onChange={(e) => setAdminPrompt(e.target.value)}
                  placeholder="Consultar TITAN ADMIN AI..."
                  className="flex-1 px-3 py-2 bg-[#070709] border border-zinc-800 rounded-lg text-xs text-zinc-100"
                />
                <button
                  type="submit"
                  disabled={chatLoading}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {chatLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Enviar
                </button>
              </form>
            </div>

            <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-5 space-y-4">
              <h3 className="font-display text-base font-semibold text-white flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-red-500" />
                Memória Administrativa Persistente ({adminKnowledge.length})
              </h3>
              <form onSubmit={handleTeachAdminAi} className="space-y-2.5">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={kbTitle}
                    onChange={(e) => setKbTitle(e.target.value)}
                    placeholder="Título do procedimento ou regra"
                    className="flex-1 px-3 py-1.5 bg-[#070709] border border-zinc-800 rounded-md text-xs text-zinc-100"
                  />
                  <select
                    value={kbCategory}
                    onChange={(e) => setKbCategory(e.target.value)}
                    className="px-2.5 py-1.5 bg-[#070709] border border-zinc-800 rounded-md text-xs text-zinc-200"
                  >
                    <option value="Procedimento">Procedimento</option>
                    <option value="Segurança">Segurança</option>
                    <option value="Infraestrutura">Infraestrutura</option>
                  </select>
                </div>
                <textarea
                  value={kbContent}
                  onChange={(e) => setKbContent(e.target.value)}
                  rows={3}
                  placeholder="Ensine um procedimento operacional validado ao TITAN ADMIN AI..."
                  className="w-full p-2.5 bg-[#070709] border border-zinc-800 rounded-md text-xs text-zinc-100"
                />
                <button
                  type="submit"
                  className="px-3.5 py-1.5 bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold rounded-md inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Registrar Conhecimento
                </button>
              </form>

              <div className="max-h-44 overflow-y-auto space-y-2">
                {adminKnowledge.map((entry) => (
                  <div key={entry.id} className="p-2.5 bg-[#070709] border border-zinc-800 rounded-lg flex items-start justify-between gap-2 text-xs">
                    <div>
                      <p className="font-semibold text-zinc-200">
                        [{entry.category}] {entry.title}
                      </p>
                      <p className="text-zinc-400 mt-0.5">{entry.content}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void deleteAdminKnowledgeEntry(entry.id)}
                      className="text-zinc-500 hover:text-red-400 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Section 23 Acceptance Test Suite */}
          <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="font-display text-base font-semibold text-white flex items-center gap-2">
                  <FlaskConical className="w-4 h-4 text-red-500" />
                  Suíte de Testes Reais e Autocorreção (Seção 23)
                </h3>
                <p className="text-xs text-zinc-400">
                  Executa os 6 testes obrigatórios contra o motor próprio autônomo e os 10 validadores independentes.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleRunTestSuite()}
                disabled={testingSuite}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg inline-flex items-center gap-2 cursor-pointer"
              >
                {testingSuite && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {testingSuite ? 'Executando 6 Testes...' : 'Executar Suíte Completa'}
              </button>
            </div>

            {suiteResults && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {suiteResults.map((res) => (
                  <div key={res.id} className="bg-[#070709] border border-zinc-800 rounded-lg p-4 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">{res.name}</span>
                      <span className={res.status === 'COMPLETED' ? 'text-emerald-400 inline-flex items-center gap-1' : 'text-red-400 inline-flex items-center gap-1'}>
                        {res.status === 'COMPLETED' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                        {res.status}
                      </span>
                    </div>
                    <p className="text-zinc-400">
                      {res.language} ({res.environment}) · {res.filesCount} arquivo(s)
                    </p>
                    <p className="text-zinc-500 tabular-nums">
                      Validadores aprovados: {res.validators.filter((v) => v.passed).length}/{res.validators.length}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Audit Logs */}
      <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-5 space-y-3">
        <h3 className="font-display text-base font-semibold text-white">
          Logs de Auditoria ({auditLogs.length})
        </h3>
        {auditLogs.length === 0 ? (
          <p className="text-xs text-zinc-500">Nenhum evento registrado ainda.</p>
        ) : (
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500">
                  <th className="py-2 pr-4 font-medium">Módulo</th>
                  <th className="py-2 pr-4 font-medium">Ação</th>
                  <th className="py-2 pr-4 font-medium">Severidade</th>
                  <th className="py-2 font-medium">Detalhe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="py-2 pr-4 font-mono text-zinc-300">{log.module}</td>
                    <td className="py-2 pr-4 font-mono text-zinc-400">{log.action}</td>
                    <td className="py-2 pr-4 uppercase text-[10px] text-zinc-400">{log.severity}</td>
                    <td className="py-2 text-zinc-300">{log.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
