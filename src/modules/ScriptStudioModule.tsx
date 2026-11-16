import {
  ArrowLeftRight,
  BookOpen,
  History,
  Loader2,
  Play,
  Sparkles,
  Wand2,
  Wrench,
  Zap,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { PipelineResultPanel } from '../components/PipelineResultPanel.tsx';
import { useTitan } from '../contexts/TitanContext.tsx';
import { generateWithPipeline, transformScript } from '../lib/titanApi.ts';
import { recordTaskExecution, writeAuditLog } from '../lib/workspaceService.ts';
import type { DeliveryMode, GenerationResult, ScriptTransformResult } from '../shared/titanTypes.ts';
import {
  SUPPORTED_LANGUAGES,
  detectLanguageAndEnvironment,
  detectSingleFileIntent,
} from '../shared/titanValidators.ts';

const PRESET_PROMPTS = [
  {
    label: 'Fly em Luau',
    prompt: 'Crie um script Fly completo em Luau para Roblox em um único script com ativação por tecla F, controle WASD, Subir/Descer e ajuste de velocidade.',
    lang: 'Luau',
    mode: 'single-file' as DeliveryMode,
  },
  {
    label: 'Calculadora Python',
    prompt: 'Crie uma calculadora funcional em Python em um único arquivo com operações soma, subtração, multiplicação, divisão, potência, tratamento de ZeroDivisionError e testes automatizados com assert.',
    lang: 'Python',
    mode: 'single-file' as DeliveryMode,
  },
  {
    label: 'API REST TypeScript',
    prompt: 'Crie uma API REST em TypeScript com endpoints CRUD validados e verificação automática.',
    lang: 'TypeScript',
    mode: 'single-file' as DeliveryMode,
  },
  {
    label: 'Programa CLI C++',
    prompt: 'Crie um programa CLI em C++ com classe de registro de tarefas, flags e tratamento de exceções.',
    lang: 'C++',
    mode: 'single-file' as DeliveryMode,
  },
  {
    label: 'CRUD PHP PDO',
    prompt: 'Crie um serviço CRUD completo em PHP 8 usando PDO e prepared statements.',
    lang: 'PHP',
    mode: 'single-file' as DeliveryMode,
  },
  {
    label: 'Leitor Arquivos Go',
    prompt: 'Crie um leitor de arquivos em Go usando bufio.Scanner com estatísticas e tratamento de erros.',
    lang: 'Go',
    mode: 'single-file' as DeliveryMode,
  },
  {
    label: 'Componente React TSX',
    prompt: 'Crie um componente React em TSX com lista interativa de tarefas e filtros.',
    lang: 'TSX',
    mode: 'single-file' as DeliveryMode,
  },
  {
    label: 'Schema SQLite SQL',
    prompt: 'Crie um script SQL com CREATE TABLE, INSERTs e SELECT analítico.',
    lang: 'SQL',
    mode: 'single-file' as DeliveryMode,
  },
];

interface VersionSnapshot {
  id: string;
  label: string;
  language: string;
  code: string;
  createdAt: string;
}

export function ScriptStudioModule() {
  const { user, userProfile, notify } = useTitan();
  const [prompt, setPrompt] = useState('');
  const [explicitLanguage, setExplicitLanguage] = useState('Auto');
  const [explicitEnvironment, setExplicitEnvironment] = useState('Auto');
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>(
    userProfile?.defaultDeliveryMode || 'auto',
  );
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);

  // Script Studio 2.0 Interactive Workbench State
  const [workbenchCode, setWorkbenchCode] = useState('');
  const [workbenchLang, setWorkbenchLang] = useState('Python');
  const [convertTargetLang, setConvertTargetLang] = useState('TypeScript');
  const [errorHint, setErrorHint] = useState('');
  const [transformBusy, setTransformBusy] = useState(false);
  const [transformResult, setTransformResult] = useState<ScriptTransformResult | null>(null);
  const [versions, setVersions] = useState<VersionSnapshot[]>([]);

  const liveDetection = useMemo(() => {
    if (!prompt.trim()) return null;
    const lang = detectLanguageAndEnvironment(prompt, explicitLanguage, explicitEnvironment);
    const single = detectSingleFileIntent(prompt, deliveryMode);
    return { lang, single };
  }, [prompt, explicitLanguage, explicitEnvironment, deliveryMode]);

  const pushVersion = (label: string, language: string, code: string) => {
    setVersions((prev) => [
      {
        id: `v_${Date.now().toString(36)}`,
        label,
        language,
        code,
        createdAt: new Date().toLocaleTimeString('pt-BR'),
      },
      ...prev.slice(0, 14),
    ]);
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) {
      notify('warning', 'Prompt vazio', 'Descreva o script que deseja construir.');
      return;
    }

    setLoading(true);
    try {
      const res = await generateWithPipeline({
        module: 'script-studio',
        prompt,
        explicitLanguage,
        explicitEnvironment,
        deliveryMode,
      });
      setResult(res);
      if (res.files[0]) {
        setWorkbenchCode(res.files[0].content);
        setWorkbenchLang(res.plan.language);
        pushVersion(`Gerado (${res.plan.language})`, res.plan.language, res.files[0].content);
      }

      if (user) {
        await recordTaskExecution({
          ownerId: user.uid,
          module: 'script-studio',
          prompt,
          language: res.plan.language,
          environment: res.plan.environment,
          status: res.status,
          validationSummary: res.validators.map((v) => `${v.name}: ${v.passed ? 'OK' : 'FAIL'}`).join(' | '),
        });
        await writeAuditLog({
          actorId: user.uid,
          module: 'script-studio',
          action: 'generate_script',
          severity: res.status === 'COMPLETED' ? 'info' : 'warning',
          detail: `Script ${res.plan.language} (${res.plan.environment}) finalizado com estado ${res.status}.`,
        });
      }

      if (res.status === 'COMPLETED') {
        notify('success', 'Script Validado', `Código gerado em ${res.plan.language} sem IAs externas e aprovado.`);
      } else {
        notify('warning', `Estado: ${res.status}`, res.explanation);
      }
    } catch (err) {
      notify('error', 'Erro na geração', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleTransform = async (action: 'explain' | 'fix' | 'optimize' | 'convert' | 'format') => {
    if (!workbenchCode.trim()) {
      notify('warning', 'Editor vazio', 'Gere ou cole um código no Workbench abaixo para analisar ou transformar.');
      return;
    }
    setTransformBusy(true);
    try {
      const res = await transformScript({
        action,
        code: workbenchCode,
        sourceLanguage: workbenchLang,
        targetLanguage: action === 'convert' ? convertTargetLang : workbenchLang,
        errorHint: errorHint.trim() || undefined,
      });
      setTransformResult(res);
      if (action !== 'explain' && res.transformedCode !== workbenchCode) {
        pushVersion(`Antes de ${action}`, workbenchLang, workbenchCode);
        setWorkbenchCode(res.transformedCode);
        if (action === 'convert') {
          setWorkbenchLang(res.targetLanguage);
        }
      }
      notify('success', `Ação "${action}" concluída`, res.explanation);
    } catch (err) {
      notify('error', 'Erro na transformação', err instanceof Error ? err.message : String(err));
    } finally {
      setTransformBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-6 space-y-5">
        <div className="space-y-1">
          <h2 className="font-display text-xl font-bold text-white">
            TITAN Script Studio 2.0 (Motor Autônomo 39 Linguagens)
          </h2>
          <p className="text-sm text-zinc-400">
            Seleção manual ou detecção automática conectada diretamente ao TITAN Neural Core e ao Language Adapter System — sem dependências de IAs externas.
          </p>
        </div>

        {/* Presets */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-500 mr-1">Exemplos rápidos:</span>
          {PRESET_PROMPTS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setPrompt(p.prompt);
                setExplicitLanguage(p.lang);
                setDeliveryMode(p.mode);
              }}
              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 rounded-md transition-colors cursor-pointer"
            >
              {p.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleGenerate} className="space-y-4">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder="Ex: Crie uma calculadora em Python em arquivo único, ou selecione qualquer uma das 39 linguagens..."
            className="w-full px-4 py-3 bg-[#070709] border border-zinc-800 focus:border-red-600 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-400">
                Linguagem ({SUPPORTED_LANGUAGES.length} suportadas)
              </label>
              <select
                value={explicitLanguage}
                onChange={(e) => setExplicitLanguage(e.target.value)}
                className="w-full px-3 py-2 bg-[#070709] border border-zinc-800 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-red-600"
              >
                <option value="Auto">Reconhecimento Automático</option>
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-400">
                Ambiente de Execução
              </label>
              <select
                value={explicitEnvironment}
                onChange={(e) => setExplicitEnvironment(e.target.value)}
                className="w-full px-3 py-2 bg-[#070709] border border-zinc-800 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-red-600"
              >
                <option value="Auto">Automático pelo Contexto</option>
                <option value="Roblox">Roblox Studio</option>
                <option value="Python 3">Python 3</option>
                <option value="Node.js">Node.js</option>
                <option value="Browser Web">Browser Web</option>
                <option value="Android">Android</option>
                <option value="Linux Shell">Linux Shell</option>
                <option value="Relational Database">SQL Database</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-400">
                Modo de Entrega
              </label>
              <select
                value={deliveryMode}
                onChange={(e) => setDeliveryMode(e.target.value as DeliveryMode)}
                className="w-full px-3 py-2 bg-[#070709] border border-zinc-800 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-red-600"
              >
                <option value="auto">Automático (Single-File Intelligence)</option>
                <option value="single-file">Arquivo Único Obrigatório</option>
                <option value="multi-file">Múltiplos Arquivos</option>
              </select>
            </div>
          </div>

          {liveDetection && (
            <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400 pt-1">
              <span>
                Interpretação ativa: <strong className="text-zinc-200">{liveDetection.lang.language}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Ambiente: <strong className="text-zinc-200">{liveDetection.lang.environment}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>{liveDetection.single.reason}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white text-sm font-medium rounded-lg inline-flex items-center gap-2 transition-colors cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Planejando, Gerando e Validando...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  <span>Construir e Validar Script</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {result ? (
        <PipelineResultPanel result={result} />
      ) : (
        <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-8 text-center space-y-2">
          <Sparkles className="w-6 h-6 text-zinc-600 mx-auto" />
          <p className="text-sm text-zinc-300 font-medium">
            Pronto para gerar código-fonte completo em 39 linguagens
          </p>
          <p className="text-xs text-zinc-500 max-w-md mx-auto">
            Escolha um exemplo rápido ou descreva seu script. Cada entrega é validada pelo TITAN Neural Core e testada no ambiente disponível.
          </p>
        </div>
      )}

      {/* Script Studio 2.0 Transform, Repair Diff & Version History Workbench */}
      <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-semibold text-white">
              Workbench: Explicação, Reparo com Diff, Otimização & Conversão
            </h3>
            <p className="text-xs text-zinc-400">
              Cole código quebrado ou edite o script gerado para diagnosticar, reparar automaticamente com diff e converter entre linguagens.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={workbenchLang}
              onChange={(e) => setWorkbenchLang(e.target.value)}
              className="px-2.5 py-1.5 bg-[#070709] border border-zinc-800 rounded-lg text-xs text-zinc-200"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  Origem: {l}
                </option>
              ))}
            </select>
            <select
              value={convertTargetLang}
              onChange={(e) => setConvertTargetLang(e.target.value)}
              className="px-2.5 py-1.5 bg-[#070709] border border-zinc-800 rounded-lg text-xs text-zinc-200"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  Destino: {l}
                </option>
              ))}
            </select>
          </div>
        </div>

        <textarea
          value={workbenchCode}
          onChange={(e) => setWorkbenchCode(e.target.value)}
          rows={9}
          placeholder="Cole um script (ex: Python sem ':', JSON com vírgula sobrando, Luau com erro) para testar reparo, explicação ou conversão..."
          className="w-full p-3.5 bg-[#070709] border border-zinc-800 rounded-lg font-mono text-xs text-zinc-100 focus:outline-none focus:border-red-600"
        />

        <div className="flex flex-col sm:flex-row gap-2.5">
          <input
            type="text"
            value={errorHint}
            onChange={(e) => setErrorHint(e.target.value)}
            placeholder="Dica de erro opcional (ex: SyntaxError ou ZeroDivisionError)..."
            className="flex-1 px-3 py-1.5 bg-[#070709] border border-zinc-800 rounded-lg text-xs text-zinc-200"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={transformBusy}
              onClick={() => void handleTransform('explain')}
              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5 text-red-400" />
              Explicar
            </button>
            <button
              type="button"
              disabled={transformBusy}
              onClick={() => void handleTransform('fix')}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Wrench className="w-3.5 h-3.5" />
              Corrigir Erros
            </button>
            <button
              type="button"
              disabled={transformBusy}
              onClick={() => void handleTransform('optimize')}
              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              Otimizar
            </button>
            <button
              type="button"
              disabled={transformBusy}
              onClick={() => void handleTransform('format')}
              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Wand2 className="w-3.5 h-3.5 text-emerald-400" />
              Formatar
            </button>
            <button
              type="button"
              disabled={transformBusy}
              onClick={() => void handleTransform('convert')}
              className="px-3 py-1.5 bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              Converter
            </button>
          </div>
        </div>

        {transformResult && (
          <div className="bg-[#070709] border border-zinc-800 rounded-lg p-4 space-y-3 text-xs">
            <div className="font-semibold text-white">
              Resultado: {transformResult.action.toUpperCase()} ({transformResult.sourceLanguage} → {transformResult.targetLanguage})
            </div>
            <p className="text-zinc-300 whitespace-pre-wrap leading-relaxed">{transformResult.explanation}</p>
            {transformResult.diff && (
              <div className="space-y-1">
                <div className="text-[11px] font-mono text-zinc-500">Diff (Antes → Depois):</div>
                <pre className="p-3 rounded bg-[#0C0C10] border border-zinc-800 font-mono text-[11px] text-zinc-200 overflow-x-auto max-h-60">
                  {transformResult.diff}
                </pre>
              </div>
            )}
          </div>
        )}

        {versions.length > 0 && (
          <div className="pt-2 border-t border-zinc-800 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-400">
              <History className="w-3.5 h-3.5" />
              <span>Histórico de Versões na Sessão ({versions.length})</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {versions.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => {
                    setWorkbenchCode(v.code);
                    setWorkbenchLang(v.language);
                  }}
                  className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded text-[11px] text-zinc-300 cursor-pointer"
                >
                  {v.createdAt} · {v.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
