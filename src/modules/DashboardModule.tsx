import {
  ArrowRight,
  Box,
  CheckCircle2,
  Cloud,
  Cpu,
  Database,
  FolderGit2,
  Gamepad2,
  GitBranch,
  Globe,
  HeartPulse,
  PackagePlus,
  ServerCog,
  Smartphone,
  TerminalSquare,
} from 'lucide-react';
import React from 'react';
import { useTitan } from '../contexts/TitanContext.tsx';
import type { NavSectionId } from '../shared/titanTypes.ts';

export function DashboardModule() {
  const {
    user,
    capabilities,
    projects,
    tasks,
    deployments,
    backups,
    auditLogs,
    setActiveNav,
  } = useTitan();

  const completedTasks = tasks.filter((t) => t.status === 'COMPLETED').length;
  const onlineDeploys = deployments.filter((d) => d.status === 'ONLINE').length;

  const quickModules: Array<{
    id: NavSectionId;
    title: string;
    desc: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      id: 'script-studio',
      title: 'Script Studio',
      desc: 'Geração real multi-linguagem com Single-File Intelligence e validadores.',
      icon: TerminalSquare,
    },
    {
      id: 'project-builder',
      title: 'Project Builder',
      desc: 'Arquitetura multi-arquivo completa para Android, Web, APIs e Python.',
      icon: Box,
    },
    {
      id: 'deploy-center',
      title: 'Deploy Center',
      desc: 'Dockerfile, Render, Vercel, Netlify, Railway, Cloudflare e sonda DNS/TLS.',
      icon: Cloud,
    },
    {
      id: 'web-to-apk',
      title: 'Web-to-APK',
      desc: 'Empacotamento WebView, PWA/TWA (assetlinks.json) e Android Híbrido.',
      icon: PackagePlus,
    },
    {
      id: 'quality-engine',
      title: 'Quality & Self-Healing',
      desc: 'Diagnóstico em 6 etapas, backup SHA-256 prévio e reparo seguro.',
      icon: HeartPulse,
    },
    {
      id: 'git-control',
      title: 'Git & Version Control',
      desc: 'Git CLI, commits/branches/PRs no GitHub e importação no Workspace.',
      icon: GitBranch,
    },
    {
      id: 'control-center',
      title: 'Control Center',
      desc: 'Console operacional central: filas assíncronas, saúde e cache.',
      icon: ServerCog,
    },
    {
      id: 'luau-lab',
      title: 'Luau Lab 2.0',
      desc: 'Scripts Roblox com separação Script, LocalScript e ModuleScript.',
      icon: Gamepad2,
    },
    {
      id: 'apk-builder',
      title: 'APK Builder 2.0',
      desc: 'Configuração Gradle/Kotlin, Manifest e exportação de projetos Android.',
      icon: Smartphone,
    },
    {
      id: 'web-studio',
      title: 'Web Studio',
      desc: 'Editor HTML/CSS/JS com preview ao vivo e console capturado.',
      icon: Globe,
    },
    {
      id: 'database-studio',
      title: 'Database Studio',
      desc: 'Modelagem e execução SQL real com motor SQLite WebAssembly.',
      icon: Database,
    },
    {
      id: 'titan-ai',
      title: 'Titan Core AI',
      desc: 'Assistente principal multi-provedor com memória por projeto.',
      icon: Cpu,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header Summary */}
      <section className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <p className="text-xs text-zinc-400">
            Workstation · {user?.email}
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight [text-wrap:balance]">
            Ecossistema Autônomo TITAN CODE
          </h1>
          <p className="text-sm text-zinc-400 leading-relaxed">
            28 módulos integrados: geração multi-provedor validada, Deploy Center com verificação DNS/TLS, Web-to-APK/TWA, Self-Healing, Git Control, Test Lab e Cloud Backups SHA-256.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setActiveNav('deploy-center')}
            className="px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
          >
            Deploy Center
          </button>
          <button
            type="button"
            onClick={() => setActiveNav('web-to-apk')}
            className="px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-100 text-sm font-medium rounded-lg transition-colors cursor-pointer"
          >
            Web-to-APK
          </button>
        </div>
      </section>

      {/* Real Firestore KPI Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-5 space-y-1">
          <p className="text-xs text-zinc-400">Projetos no Workspace</p>
          <p className="font-display text-2xl font-bold text-white tabular-nums">
            {projects.length}
          </p>
        </div>
        <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-5 space-y-1">
          <p className="text-xs text-zinc-400">Deploys Online / Total</p>
          <p className="font-display text-2xl font-bold text-white tabular-nums">
            {onlineDeploys} / {deployments.length}
          </p>
        </div>
        <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-5 space-y-1">
          <p className="text-xs text-zinc-400">Backups SHA-256</p>
          <p className="font-display text-2xl font-bold text-white tabular-nums">
            {backups.length}
          </p>
        </div>
        <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-5 space-y-1">
          <p className="text-xs text-zinc-400">Tarefas / Auditoria</p>
          <p className="font-display text-2xl font-bold text-white tabular-nums">
            {completedTasks} / {auditLogs.length}
          </p>
        </div>
      </section>

      {/* Quick Launch Modules */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-white">
            Módulos Principais
          </h2>
          <button
            type="button"
            onClick={() => setActiveNav('workspace')}
            className="text-xs text-zinc-400 hover:text-white inline-flex items-center gap-1 cursor-pointer"
          >
            <FolderGit2 className="w-3.5 h-3.5" />
            Gerenciar Workspace
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {quickModules.map((mod) => {
            const Icon = mod.icon;
            return (
              <button
                key={mod.id}
                type="button"
                onClick={() => setActiveNav(mod.id)}
                className="text-left bg-[#0C0C10] hover:bg-[#111117] border border-zinc-800 hover:border-red-600/50 rounded-xl p-5 transition-colors flex flex-col justify-between gap-4 cursor-pointer"
              >
                <div className="space-y-2.5">
                  <Icon className="w-5 h-5 text-red-500" />
                  <h3 className="font-display text-base font-semibold text-white">
                    {mod.title}
                  </h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">{mod.desc}</p>
                </div>
                <span className="text-xs font-medium text-zinc-300 inline-flex items-center gap-1">
                  Acessar <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Real Environment Capabilities & Recent Tasks */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-5 space-y-4">
          <h3 className="font-display text-base font-semibold text-white">
            Capacidades Reais do Ambiente
          </h3>
          {capabilities ? (
            <div className="divide-y divide-zinc-800/80 text-xs">
              <CapabilityRow
                label="TITAN Neural Core (IA Própria)"
                value={capabilities.neuralCoreReady ? capabilities.modelName : 'Inicializando'}
                available={capabilities.neuralCoreReady}
              />
              <CapabilityRow
                label="Node.js Sandbox"
                value={capabilities.nodeVersion}
                available={true}
              />
              <CapabilityRow
                label="Python Runtime"
                value={capabilities.pythonVersion || 'Não instalado'}
                available={capabilities.pythonAvailable}
              />
              <CapabilityRow
                label="Firebase Firestore"
                value={capabilities.firebaseConfigured ? 'Conectado' : 'Não configurado'}
                available={capabilities.firebaseConfigured}
              />
              <CapabilityRow
                label="Android SDK & Gradle"
                value={
                  capabilities.androidSdkAvailable && capabilities.gradleAvailable
                    ? 'Instalado'
                    : 'Ausente (somente geração fonte)'
                }
                available={capabilities.androidSdkAvailable && capabilities.gradleAvailable}
              />
            </div>
          ) : (
            <p className="text-xs text-zinc-500">Verificando ambiente...</p>
          )}
        </div>

        <div className="lg:col-span-2 bg-[#0C0C10] border border-zinc-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-base font-semibold text-white">
              Histórico Recente de Execuções
            </h3>
            <span className="text-xs text-zinc-500 tabular-nums">
              {tasks.length} registro(s)
            </span>
          </div>

          {tasks.length === 0 ? (
            <div className="py-10 text-center space-y-3">
              <p className="text-sm text-zinc-400">
                Nenhuma geração executada ainda nesta conta.
              </p>
              <button
                type="button"
                onClick={() => setActiveNav('script-studio')}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded-lg cursor-pointer"
              >
                Executar Primeira Geração
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500">
                    <th className="py-2 pr-4 font-medium">Módulo</th>
                    <th className="py-2 pr-4 font-medium">Linguagem</th>
                    <th className="py-2 pr-4 font-medium">Solicitação</th>
                    <th className="py-2 font-medium text-right">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {tasks.slice(0, 8).map((task) => (
                    <tr key={task.id} className="hover:bg-zinc-900/40">
                      <td className="py-2.5 pr-4 font-mono text-zinc-300 whitespace-nowrap">
                        {task.module}
                      </td>
                      <td className="py-2.5 pr-4 text-zinc-300 whitespace-nowrap">
                        {task.language}
                      </td>
                      <td className="py-2.5 pr-4 text-zinc-400 max-w-xs truncate">
                        {task.prompt}
                      </td>
                      <td className="py-2.5 text-right font-mono whitespace-nowrap">
                        <span
                          className={
                            task.status === 'COMPLETED'
                              ? 'text-emerald-400'
                              : task.status === 'BLOCKED'
                              ? 'text-amber-400'
                              : 'text-red-400'
                          }
                        >
                          {task.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function CapabilityRow({
  label,
  value,
  available,
}: {
  label: string;
  value: string;
  available: boolean;
}) {
  return (
    <div className="py-2.5 flex items-center justify-between gap-3">
      <span className="text-zinc-400">{label}</span>
      <span className="inline-flex items-center gap-1.5 font-mono text-zinc-200 text-right">
        {available ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        ) : (
          <span className="text-amber-400 text-[11px]">[Pendente]</span>
        )}
        <span>{value}</span>
      </span>
    </div>
  );
}
