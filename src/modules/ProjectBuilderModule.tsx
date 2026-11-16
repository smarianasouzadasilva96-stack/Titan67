import { Box, Loader2 } from 'lucide-react';
import React, { useState } from 'react';
import { PipelineResultPanel } from '../components/PipelineResultPanel.tsx';
import { useTitan } from '../contexts/TitanContext.tsx';
import { generateWithPipeline } from '../lib/titanApi.ts';
import { recordTaskExecution, writeAuditLog } from '../lib/workspaceService.ts';
import type { GenerationResult, ProjectType } from '../shared/titanTypes.ts';

const PROJECT_TEMPLATES: Array<{
  id: string;
  label: string;
  type: ProjectType;
  lang: string;
  env: string;
  prompt: string;
}> = [
  {
    id: 'android-kotlin',
    label: 'Android Kotlin (Compose / Activity)',
    type: 'android',
    lang: 'Kotlin',
    env: 'Android',
    prompt:
      'Crie um aplicativo Android completo em Kotlin com tela funcional de gerenciamento de tarefas diárias, incluindo MainActivity.kt implementada com Jetpack Compose, AndroidManifest.xml configurado, build.gradle.kts, strings.xml e README.md técnico.',
  },
  {
    id: 'web-app',
    label: 'Aplicação Web HTML/CSS/JS',
    type: 'web',
    lang: 'HTML',
    env: 'Browser Web',
    prompt:
      'Crie um projeto web completo em múltiplos arquivos (index.html, styles.css, app.js, README.md) implementando um painel de planejamento financeiro pessoal com categorias, cálculos reais e persistência local.',
  },
  {
    id: 'node-api',
    label: 'API REST TypeScript / Express',
    type: 'api',
    lang: 'TypeScript',
    env: 'Node.js',
    prompt:
      'Crie uma API REST multi-arquivo em TypeScript com Express contendo package.json, tsconfig.json, src/server.ts, src/routes/tasks.ts, src/validators/taskSchema.ts e README.md.',
  },
  {
    id: 'python-pkg',
    label: 'Projeto Modular Python',
    type: 'fullstack',
    lang: 'Python',
    env: 'Python 3',
    prompt:
      'Crie um projeto Python multi-arquivo para análise de logs com main.py, parser.py, reporter.py, test_parser.py (com asserts reais), requirements.txt e README.md.',
  },
];

export function ProjectBuilderModule() {
  const { user, notify } = useTitan();
  const [projectName, setProjectName] = useState('titan-mobile-tasks');
  const [projectType, setProjectType] = useState<ProjectType>('android');
  const [language, setLanguage] = useState('Kotlin');
  const [environment, setEnvironment] = useState('Android');
  const [prompt, setPrompt] = useState(PROJECT_TEMPLATES[0].prompt);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);

  const handleBuild = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) {
      notify('warning', 'Descrição necessária', 'Descreva a arquitetura e funcionalidades do projeto.');
      return;
    }

    setLoading(true);
    try {
      const res = await generateWithPipeline({
        module: 'project-builder',
        prompt,
        explicitLanguage: language,
        explicitEnvironment: environment,
        deliveryMode: 'multi-file',
        projectTypeOverride: projectType,
      });
      setResult(res);

      if (user) {
        await recordTaskExecution({
          ownerId: user.uid,
          module: 'project-builder',
          prompt,
          language: res.plan.language,
          environment: res.plan.environment,
          status: res.status,
          validationSummary: `${res.files.length} arquivos | ${res.validators.filter((v) => v.passed).length}/${res.validators.length} validadores OK`,
        });
        await writeAuditLog({
          actorId: user.uid,
          module: 'project-builder',
          action: 'build_project',
          severity: res.status === 'COMPLETED' ? 'info' : 'warning',
          detail: `Projeto ${projectName} (${res.plan.language}) gerado com ${res.files.length} arquivos.`,
        });
      }

      notify(
        res.status === 'COMPLETED' ? 'success' : 'warning',
        `Project Builder: ${res.status}`,
        `${res.files.length} arquivo(s) implementados e verificados pelo Project Completeness Validator.`,
      );
    } catch (err) {
      notify('error', 'Falha no Project Builder', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-6 space-y-5">
        <div className="space-y-1">
          <h2 className="font-display text-xl font-bold text-white">
            TITAN Project Builder
          </h2>
          <p className="text-sm text-zinc-400">
            Arquitetura e geração multi-arquivo completa com Project Completeness Validator (bloqueia MainActivity vazia, arquivos vazios e READMEs sem documentação real).
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {PROJECT_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => {
                setProjectType(tpl.type);
                setLanguage(tpl.lang);
                setEnvironment(tpl.env);
                setPrompt(tpl.prompt);
                setProjectName(`titan-${tpl.id}`);
              }}
              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 rounded-md cursor-pointer"
            >
              {tpl.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleBuild} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-400">Nome do Projeto</label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="w-full px-3 py-2 bg-[#070709] border border-zinc-800 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-red-600"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-400">Tipo</label>
              <select
                value={projectType}
                onChange={(e) => setProjectType(e.target.value as ProjectType)}
                className="w-full px-3 py-2 bg-[#070709] border border-zinc-800 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-red-600"
              >
                <option value="android">Android Kotlin</option>
                <option value="web">Web App</option>
                <option value="api">API / Backend</option>
                <option value="luau">Sistema Roblox Luau</option>
                <option value="fullstack">Multi-Arquivo Geral</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-400">Linguagem Principal</label>
              <input
                type="text"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full px-3 py-2 bg-[#070709] border border-zinc-800 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-red-600"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-400">Ambiente</label>
              <input
                type="text"
                value={environment}
                onChange={(e) => setEnvironment(e.target.value)}
                className="w-full px-3 py-2 bg-[#070709] border border-zinc-800 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-red-600"
              />
            </div>
          </div>

          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder="Descreva funcionalidades, telas, rotas, modelos de dados e critérios de teste..."
            className="w-full px-4 py-3 bg-[#070709] border border-zinc-800 rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-red-600"
          />

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white text-sm font-medium rounded-lg inline-flex items-center gap-2 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Construindo Projeto Completo...</span>
                </>
              ) : (
                <>
                  <Box className="w-4 h-4" />
                  <span>Construir Projeto</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {result && <PipelineResultPanel result={result} projectNameSuggestion={projectName} />}
    </div>
  );
}
