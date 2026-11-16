import React, { Suspense, lazy } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { TitanShell } from './components/TitanShell.tsx';
import { TitanProvider, useTitan } from './contexts/TitanContext.tsx';

const DashboardModule = lazy(() =>
  import('./modules/DashboardModule.tsx').then((m) => ({ default: m.DashboardModule })),
);
const TitanAiModule = lazy(() =>
  import('./modules/TitanAiModule.tsx').then((m) => ({ default: m.TitanAiModule })),
);
const AiOrchestratorModule = lazy(() =>
  import('./modules/AiOrchestratorModule.tsx').then((m) => ({ default: m.AiOrchestratorModule })),
);
const ScriptStudioModule = lazy(() =>
  import('./modules/ScriptStudioModule.tsx').then((m) => ({ default: m.ScriptStudioModule })),
);
const ProjectBuilderModule = lazy(() =>
  import('./modules/ProjectBuilderModule.tsx').then((m) => ({ default: m.ProjectBuilderModule })),
);
const CodeGeneratorModule = lazy(() =>
  import('./modules/CodeGeneratorModule.tsx').then((m) => ({ default: m.CodeGeneratorModule })),
);
const LuauLabModule = lazy(() =>
  import('./modules/LuauLabModule.tsx').then((m) => ({ default: m.LuauLabModule })),
);
const ApkBuilderModule = lazy(() =>
  import('./modules/ApkBuilderModule.tsx').then((m) => ({ default: m.ApkBuilderModule })),
);
const WebToApkModule = lazy(() =>
  import('./modules/WebToApkModule.tsx').then((m) => ({ default: m.WebToApkModule })),
);
const WebStudioModule = lazy(() =>
  import('./modules/WebStudioModule.tsx').then((m) => ({ default: m.WebStudioModule })),
);
const DatabaseStudioModule = lazy(() =>
  import('./modules/DatabaseStudioModule.tsx').then((m) => ({ default: m.DatabaseStudioModule })),
);
const ApiStudioModule = lazy(() =>
  import('./modules/ApiStudioModule.tsx').then((m) => ({ default: m.ApiStudioModule })),
);
const DebuggerModule = lazy(() =>
  import('./modules/DebuggerModule.tsx').then((m) => ({ default: m.DebuggerModule })),
);
const QualityEngineModule = lazy(() =>
  import('./modules/QualityEngineModule.tsx').then((m) => ({ default: m.QualityEngineModule })),
);
const TestLabModule = lazy(() =>
  import('./modules/TestLabModule.tsx').then((m) => ({ default: m.TestLabModule })),
);
const ToolboxModule = lazy(() =>
  import('./modules/ToolboxModule.tsx').then((m) => ({ default: m.ToolboxModule })),
);
const DeployCenterModule = lazy(() =>
  import('./modules/DeployCenterModule.tsx').then((m) => ({ default: m.DeployCenterModule })),
);
const PerformanceEngineModule = lazy(() =>
  import('./modules/PerformanceEngineModule.tsx').then((m) => ({ default: m.PerformanceEngineModule })),
);
const ControlCenterModule = lazy(() =>
  import('./modules/ControlCenterModule.tsx').then((m) => ({ default: m.ControlCenterModule })),
);
const SecurityCenterModule = lazy(() =>
  import('./modules/SecurityCenterModule.tsx').then((m) => ({ default: m.SecurityCenterModule })),
);
const GitControlModule = lazy(() =>
  import('./modules/GitControlModule.tsx').then((m) => ({ default: m.GitControlModule })),
);
const CloudFilesModule = lazy(() =>
  import('./modules/CloudFilesModule.tsx').then((m) => ({ default: m.CloudFilesModule })),
);
const AutomationsModule = lazy(() =>
  import('./modules/AutomationsModule.tsx').then((m) => ({ default: m.AutomationsModule })),
);
const IntegrationsCenterModule = lazy(() =>
  import('./modules/IntegrationsCenterModule.tsx').then((m) => ({ default: m.IntegrationsCenterModule })),
);
const AgentsModule = lazy(() =>
  import('./modules/AgentsModule.tsx').then((m) => ({ default: m.AgentsModule })),
);
const WorkspaceModule = lazy(() =>
  import('./modules/WorkspaceModule.tsx').then((m) => ({ default: m.WorkspaceModule })),
);
const AdministrationModule = lazy(() =>
  import('./modules/AdministrationModule.tsx').then((m) => ({ default: m.AdministrationModule })),
);
const SettingsModule = lazy(() =>
  import('./modules/SettingsModule.tsx').then((m) => ({ default: m.SettingsModule })),
);

function ModuleSkeleton() {
  return (
    <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-8 flex items-center justify-center text-xs font-mono text-zinc-400">
      Carregando módulo TITAN CODE...
    </div>
  );
}

function ActiveModuleRouter() {
  const { activeNav } = useTitan();

  switch (activeNav) {
    case 'dashboard':
      return <DashboardModule />;
    case 'titan-ai':
      return <TitanAiModule />;
    case 'ai-orchestrator':
      return <AiOrchestratorModule />;
    case 'script-studio':
      return <ScriptStudioModule />;
    case 'project-builder':
      return <ProjectBuilderModule />;
    case 'code-generator':
      return <CodeGeneratorModule />;
    case 'luau-lab':
      return <LuauLabModule />;
    case 'apk-builder':
      return <ApkBuilderModule />;
    case 'web-to-apk':
      return <WebToApkModule />;
    case 'web-studio':
      return <WebStudioModule />;
    case 'database-studio':
      return <DatabaseStudioModule />;
    case 'api-studio':
      return <ApiStudioModule />;
    case 'debugger':
      return <DebuggerModule />;
    case 'quality-engine':
      return <QualityEngineModule />;
    case 'test-lab':
      return <TestLabModule />;
    case 'toolbox':
      return <ToolboxModule />;
    case 'deploy-center':
      return <DeployCenterModule />;
    case 'performance-engine':
      return <PerformanceEngineModule />;
    case 'control-center':
      return <ControlCenterModule />;
    case 'security-center':
      return <SecurityCenterModule />;
    case 'git-control':
      return <GitControlModule />;
    case 'cloud-files':
      return <CloudFilesModule />;
    case 'automation-center':
      return <AutomationsModule />;
    case 'integrations-center':
      return <IntegrationsCenterModule />;
    case 'agents':
      return <AgentsModule />;
    case 'workspace':
      return <WorkspaceModule />;
    case 'administration':
      return <AdministrationModule />;
    case 'settings':
      return <SettingsModule />;
    default:
      return <DashboardModule />;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <TitanProvider>
        <TitanShell>
          <Suspense fallback={<ModuleSkeleton />}>
            <ActiveModuleRouter />
          </Suspense>
        </TitanShell>
      </TitanProvider>
    </ErrorBoundary>
  );
}
