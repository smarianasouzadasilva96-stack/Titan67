import { Gamepad2, Loader2 } from 'lucide-react';
import React, { useState } from 'react';
import { PipelineResultPanel } from '../components/PipelineResultPanel.tsx';
import { useTitan } from '../contexts/TitanContext.tsx';
import { generateWithPipeline } from '../lib/titanApi.ts';
import { recordTaskExecution } from '../lib/workspaceService.ts';
import type { DeliveryMode, GenerationResult } from '../shared/titanTypes.ts';

const LUAU_SYSTEMS = [
  {
    label: 'Sistema de Voo (Fly LocalScript)',
    scriptKind: 'LocalScript',
    prompt: 'Crie um script Fly em Luau para Roblox usando LocalScript com UserInputService (tecla F), RunService.RenderStepped, LinearVelocity/AlignOrientation e movimentação relativa à câmera.',
  },
  {
    label: 'Inventário + RemoteEvents (Server/Client)',
    scriptKind: 'Multi',
    prompt: 'Crie um sistema completo de inventário para Roblox separando Script de servidor (validação e armazenamento), ModuleScript compartilhado de itens, RemoteEvents em ReplicatedStorage e LocalScript de interface.',
  },
  {
    label: 'Moedas & DataStoreService',
    scriptKind: 'Script',
    prompt: 'Crie um sistema de moedas (Leaderstats) com salvamento seguro via DataStoreService, pcall com retry, BindToClose e validação de transações no servidor.',
  },
  {
    label: 'Combate & Ferramenta (Tool)',
    scriptKind: 'Multi',
    prompt: 'Crie uma Tool de espada com cooldown no servidor, verificação de distância anti-alcance inválido e feedback visual em LocalScript.',
  },
  {
    label: 'NPC Patrulha & Perseguição',
    scriptKind: 'Script',
    prompt: 'Crie um Script de servidor para NPC usando PathfindingService para patrulhar waypoints e perseguir o jogador mais próximo dentro de um raio definido.',
  },
];

export function LuauLabModule() {
  const { user, notify } = useTitan();
  const [scriptRole, setScriptRole] = useState<'Multi' | 'LocalScript' | 'Script' | 'ModuleScript'>('LocalScript');
  const [prompt, setPrompt] = useState(LUAU_SYSTEMS[0].prompt);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    try {
      const deliveryMode: DeliveryMode = scriptRole === 'Multi' ? 'multi-file' : 'single-file';
      const enrichedPrompt = `[Roblox Luau · Tipo alvo: ${scriptRole === 'Multi' ? 'Arquitetura Servidor + Cliente + Módulo' : scriptRole}] ${prompt.trim()}`;

      const res = await generateWithPipeline({
        module: 'luau-lab',
        prompt: enrichedPrompt,
        explicitLanguage: 'Luau',
        explicitEnvironment: 'Roblox',
        deliveryMode,
        projectTypeOverride: 'luau',
      });
      setResult(res);

      if (user) {
        await recordTaskExecution({
          ownerId: user.uid,
          module: 'luau-lab',
          prompt: enrichedPrompt,
          language: 'Luau',
          environment: 'Roblox',
          status: res.status,
          validationSummary: `${res.files.length} script(s) Luau validados.`,
        });
      }

      notify(
        res.status === 'COMPLETED' ? 'success' : 'warning',
        'Luau Lab 2.0',
        `Geração Luau finalizada (${res.status}).`,
      );
    } catch (err) {
      notify('error', 'Erro no Luau Lab', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-6 space-y-5">
        <div className="space-y-1">
          <h2 className="font-display text-xl font-bold text-white">
            TITAN Luau Lab 2.0
          </h2>
          <p className="text-sm text-zinc-400">
            Ambiente especializado em Roblox Luau com separação estrita entre Script (Servidor), LocalScript (Cliente) e ModuleScript (Compartilhado), usando apenas APIs oficiais do Roblox Studio.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {LUAU_SYSTEMS.map((sys) => (
            <button
              key={sys.label}
              type="button"
              onClick={() => {
                setScriptRole(sys.scriptKind as 'Multi' | 'LocalScript' | 'Script' | 'ModuleScript');
                setPrompt(sys.prompt);
              }}
              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 rounded-md cursor-pointer"
            >
              {sys.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleGenerate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-400">
                Contexto de Execução Roblox
              </label>
              <select
                value={scriptRole}
                onChange={(e) => setScriptRole(e.target.value as 'Multi' | 'LocalScript' | 'Script' | 'ModuleScript')}
                className="w-full px-3 py-2 bg-[#070709] border border-zinc-800 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-red-600"
              >
                <option value="LocalScript">LocalScript (Cliente · Arquivo Único)</option>
                <option value="Script">Script (Servidor · Arquivo Único)</option>
                <option value="ModuleScript">ModuleScript (Compartilhado · Arquivo Único)</option>
                <option value="Multi">Sistema Completo (Server + Client + Module + Remotes)</option>
              </select>
            </div>
            <div className="bg-[#070709] border border-zinc-800 rounded-lg px-4 py-2.5 text-xs text-zinc-400 flex items-center">
              Autoridade de servidor preservada: validação de estado, moedas e combate permanecem no servidor.
            </div>
          </div>

          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder="Descreva a mecânica Roblox desejada em Luau..."
            className="w-full px-4 py-3 bg-[#070709] border border-zinc-800 rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-red-600"
          />

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white text-sm font-medium rounded-lg inline-flex items-center gap-2 cursor-pointer"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gamepad2 className="w-4 h-4" />}
              <span>{loading ? 'Gerando Luau...' : 'Gerar Script Luau'}</span>
            </button>
          </div>
        </form>
      </div>

      {result && <PipelineResultPanel result={result} projectNameSuggestion="roblox-luau-system" />}
    </div>
  );
}
