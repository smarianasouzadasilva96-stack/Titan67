import { Code2, Loader2 } from 'lucide-react';
import React, { useState } from 'react';
import { PipelineResultPanel } from '../components/PipelineResultPanel.tsx';
import { useTitan } from '../contexts/TitanContext.tsx';
import { generateWithPipeline } from '../lib/titanApi.ts';
import { recordTaskExecution } from '../lib/workspaceService.ts';
import type { DeliveryMode, GenerationResult } from '../shared/titanTypes.ts';
import { SUPPORTED_LANGUAGES } from '../shared/titanValidators.ts';

export function CodeGeneratorModule() {
  const { user, notify } = useTitan();
  const [targetScope, setTargetScope] = useState<'script' | 'api' | 'ui' | 'system'>('system');
  const [language, setLanguage] = useState('TypeScript');
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('auto');
  const [requirements, setRequirements] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requirements.trim()) {
      notify('warning', 'Requisitos vazios', 'Informe os requisitos técnicos do sistema.');
      return;
    }

    setLoading(true);
    try {
      const fullPrompt = `[Escopo: ${targetScope.toUpperCase()}] ${requirements.trim()}`;
      const res = await generateWithPipeline({
        module: 'code-generator',
        prompt: fullPrompt,
        explicitLanguage: language,
        deliveryMode,
      });
      setResult(res);

      if (user) {
        await recordTaskExecution({
          ownerId: user.uid,
          module: 'code-generator',
          prompt: requirements.trim(),
          language: res.plan.language,
          environment: res.plan.environment,
          status: res.status,
          validationSummary: `${res.files.length} arquivo(s) gerados.`,
        });
      }
      notify(res.status === 'COMPLETED' ? 'success' : 'warning', 'Code Generator 2.0', `Pipeline finalizado (${res.status}).`);
    } catch (err) {
      notify('error', 'Erro', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-6 space-y-5">
        <div className="space-y-1">
          <h2 className="font-display text-xl font-bold text-white">
            TITAN Code Generator 2.0
          </h2>
          <p className="text-sm text-zinc-400">
            Fluxo determinístico: Requisitos → Planejamento → Geração → Análise → Testes → Autocorreção → Entrega.
          </p>
        </div>

        <form onSubmit={handleGenerate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-400">Artefato Alvo</label>
              <select
                value={targetScope}
                onChange={(e) => setTargetScope(e.target.value as 'script' | 'api' | 'ui' | 'system')}
                className="w-full px-3 py-2 bg-[#070709] border border-zinc-800 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-red-600"
              >
                <option value="system">Sistema Completo</option>
                <option value="api">API / Serviço Backend</option>
                <option value="ui">Interface / Componente UI</option>
                <option value="script">Script Utilitário</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-400">Linguagem</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full px-3 py-2 bg-[#070709] border border-zinc-800 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-red-600"
              >
                <option value="Auto">Auto</option>
                {SUPPORTED_LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-400">Single-File Intelligence</label>
              <select
                value={deliveryMode}
                onChange={(e) => setDeliveryMode(e.target.value as DeliveryMode)}
                className="w-full px-3 py-2 bg-[#070709] border border-zinc-800 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-red-600"
              >
                <option value="auto">Automático</option>
                <option value="single-file">Arquivo Único</option>
                <option value="multi-file">Múltiplos Arquivos</option>
              </select>
            </div>
          </div>

          <textarea
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
            rows={5}
            placeholder="Descreva os requisitos funcionais, regras de negócio, entradas, saídas esperadas e restrições..."
            className="w-full px-4 py-3 bg-[#070709] border border-zinc-800 rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-red-600"
          />

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white text-sm font-medium rounded-lg inline-flex items-center gap-2 cursor-pointer"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Code2 className="w-4 h-4" />}
              <span>{loading ? 'Processando Pipeline...' : 'Gerar Código Validado'}</span>
            </button>
          </div>
        </form>
      </div>

      {result && <PipelineResultPanel result={result} />}
    </div>
  );
}
