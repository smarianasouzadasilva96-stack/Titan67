import type {
  DeliveryMode,
  GenerationResult,
  ProjectType,
} from '../shared/titanTypes.ts';
import { runUniversalPipeline } from './titanEngine/universalGenerator.ts';
import { runAutonomousReasoningChat } from './titanNeural/contextAndReasoning.ts';
import { titanNeuralCore } from './titanNeural/datasetAndTrainer.ts';

export async function runEngineeringPipeline(params: {
  module: 'script-studio' | 'project-builder' | 'code-generator' | 'luau-lab' | 'apk-builder';
  prompt: string;
  explicitLanguage?: string;
  explicitEnvironment?: string;
  deliveryMode?: DeliveryMode;
  projectTypeOverride?: ProjectType;
  apkConfig?: {
    appName: string;
    packageName: string;
    versionName: string;
    versionCode: number;
    orientation: string;
    permissions: string[];
  };
}): Promise<GenerationResult> {
  return runUniversalPipeline(params);
}

export async function runAiChat(params: {
  mode: 'core-ai' | 'admin-ai' | 'agent';
  message: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  workspaceContext?: string;
  adminKnowledge?: Array<{ title: string; category: string; content: string }>;
  agentProfile?: { id: string; name: string; objective: string; instructions: string };
  systemMetricsSummary?: string;
  preferredProviderId?: string;
}): Promise<{ reply: string; modelUsed: string; providerId?: string; blocked?: boolean }> {
  const result = await runAutonomousReasoningChat({
    mode: params.mode,
    message: params.message,
    history: params.history,
    workspaceContext: params.workspaceContext,
    adminKnowledge: params.adminKnowledge,
    agentProfile: params.agentProfile,
    systemMetricsSummary: params.systemMetricsSummary,
  });
  return {
    reply: result.reply,
    modelUsed: result.modelUsed,
    providerId: result.providerId,
  };
}

export async function runAiChatStream(params: {
  mode: 'core-ai' | 'admin-ai' | 'agent';
  message: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  workspaceContext?: string;
  adminKnowledge?: Array<{ title: string; category: string; content: string }>;
  agentProfile?: { id: string; name: string; objective: string; instructions: string };
  systemMetricsSummary?: string;
  preferredProviderId?: string;
  onDelta: (chunk: string) => void;
}): Promise<{ reply: string; modelUsed: string; providerId?: string; blocked?: boolean }> {
  const result = await runAutonomousReasoningChat({
    mode: params.mode,
    message: params.message,
    history: params.history,
    workspaceContext: params.workspaceContext,
    adminKnowledge: params.adminKnowledge,
    agentProfile: params.agentProfile,
    systemMetricsSummary: params.systemMetricsSummary,
  });

  // Stream response cleanly word/block-wise via TITAN Response Engine
  const chunks = result.reply.match(/.{1,48}(\s|$)|\n+/g) || [result.reply];
  for (const chunk of chunks) {
    params.onDelta(chunk);
  }

  return {
    reply: result.reply,
    modelUsed: result.modelUsed,
    providerId: result.providerId,
  };
}

export async function runStaticAndAiAnalysis(params: {
  code: string;
  language: string;
  useAi: boolean;
}): Promise<{
  staticIssues: Array<{ line: number; severity: 'info' | 'warning' | 'error' | 'critical'; rule: string; message: string }>;
  unusedVars: string[];
  securityFindings: string[];
  aiReview?: string;
}> {
  const lines = params.code.split('\n');
  const staticIssues: Array<{ line: number; severity: 'info' | 'warning' | 'error' | 'critical'; rule: string; message: string }> = [];
  const unusedVars: string[] = [];
  const securityFindings: string[] = [];

  lines.forEach((lineText, idx) => {
    const lineNum = idx + 1;
    if (/\beval\s*\(/.test(lineText) || /\bnew Function\s*\(/.test(lineText)) {
      staticIssues.push({ line: lineNum, severity: 'critical', rule: 'no-eval', message: 'Uso de eval()/new Function() detectado (risco de execução arbitrária).' });
      securityFindings.push(`Linha ${lineNum}: Uso perigoso de eval/Function.`);
    }
    if (/innerHTML\s*=/.test(lineText) || /dangerouslySetInnerHTML/.test(lineText)) {
      staticIssues.push({ line: lineNum, severity: 'warning', rule: 'xss-sink', message: 'Atribuição direta a innerHTML detectada (verifique sanitização contra XSS).' });
      securityFindings.push(`Linha ${lineNum}: Potencial vetor XSS via innerHTML.`);
    }
    if (/(api_key|secret|password|token)\s*=\s*['"][^'"]{8,}['"]/i.test(lineText)) {
      staticIssues.push({ line: lineNum, severity: 'critical', rule: 'hardcoded-secret', message: 'Possível segredo ou credencial hardcoded no código.' });
      securityFindings.push(`Linha ${lineNum}: Possível credencial exposta no código-fonte.`);
    }
    if (/\bTODO\b|\bFIXME\b/.test(lineText)) {
      staticIssues.push({ line: lineNum, severity: 'info', rule: 'pending-marker', message: 'Marcador TODO/FIXME pendente encontrado.' });
    }
    if (/SELECT\s+.*\+\s*[a-zA-Z_]/i.test(lineText) || /f["']SELECT\s+.*\{/.test(lineText)) {
      staticIssues.push({ line: lineNum, severity: 'critical', rule: 'sql-injection', message: 'Possível concatenação direta em query SQL (use queries parametrizadas).' });
      securityFindings.push(`Linha ${lineNum}: Risco de SQL Injection por interpolação/concatenação.`);
    }
  });

  const declMatches = [...params.code.matchAll(/\b(?:const|let|var|local)\s+([a-zA-Z_][a-zA-Z0-9_]*)\b/g)];
  for (const m of declMatches) {
    const varName = m[1];
    if (varName.startsWith('_')) continue;
    const occurrences = (params.code.match(new RegExp(`\\b${varName}\\b`, 'g')) || []).length;
    if (occurrences === 1) {
      unusedVars.push(varName);
    }
  }

  let aiReview: string | undefined;
  if (params.useAi) {
    titanNeuralCore.ensureInitialized();
    const { transformScriptCode } = await import('./titanEngine/universalGenerator.ts');
    const explained = await transformScriptCode({
      action: 'explain',
      code: params.code,
      sourceLanguage: params.language,
    });
    const neural = titanNeuralCore.getStatus();
    aiReview = `${explained.explanation}\n\n**Diagnóstico Neural TITAN (${neural.modelId}):** ${staticIssues.length} alerta(s) estático(s), ${unusedVars.length} variável(is) não utilizada(s), ${securityFindings.length} risco(s) de segurança.`;
  }

  return { staticIssues, unusedVars, securityFindings, aiReview };
}

export function routeOrchestratorIntent(prompt: string): {
  targetModule: import('../shared/titanTypes.ts').NavSectionId;
  reason: string;
  priority: 'HIGH' | 'NORMAL' | 'LOW';
  steps: string[];
} {
  const lower = prompt.toLowerCase();
  if (/\b(deploy|hospedar|render|vercel|netlify|railway|cloudflare|dockerfile|dom[ií]nio|dns|ssl)\b/.test(lower)) {
    return {
      targetModule: 'deploy-center',
      reason: 'Intenção de publicação, infraestrutura Cloud ou verificação DNS/TLS detectada.',
      priority: 'HIGH',
      steps: ['Analisar stack do projeto', 'Gerar Dockerfile/manifests', 'Validar credenciais e executar deploy/probe'],
    };
  }
  if (/\b(web-to-apk|webview|twa|assetlinks|empacotar site|converter site em apk)\b/.test(lower)) {
    return {
      targetModule: 'web-to-apk',
      reason: 'Conversão de aplicação Web/PWA em pacote Android WebView/TWA/Híbrido.',
      priority: 'HIGH',
      steps: ['Selecionar modo WebView/TWA/Híbrido', 'Configurar com.titancode.app', 'Gerar projeto Android + CI Gradle'],
    };
  }
  if (/\b(android|apk nativo|kotlin|jetpack compose)\b/.test(lower)) {
    return {
      targetModule: 'apk-builder',
      reason: 'Criação de aplicativo Android Kotlin nativo.',
      priority: 'NORMAL',
      steps: ['Planejar arquitetura Android', 'Gerar MainActivity + Manifest + Gradle', 'Validar completude'],
    };
  }
  if (/\b(luau|roblox|localscript|modulescript|fly)\b/.test(lower)) {
    return {
      targetModule: 'luau-lab',
      reason: 'Engenharia Luau/Roblox especializada detectada.',
      priority: 'NORMAL',
      steps: ['Validar escopo Server/Client/Shared', 'Gerar script Luau validado', 'Checar delimitadores e APIs Roblox'],
    };
  }
  if (/\b(git|github|commit|branch|pull request|clonar)\b/.test(lower)) {
    return {
      targetModule: 'git-control',
      reason: 'Operação de controle de versão Git/GitHub.',
      priority: 'NORMAL',
      steps: ['Inspecionar repositório', 'Comparar diff/commits', 'Sincronizar com Workspace'],
    };
  }
  if (/\b(seguran[çc]a|vulnerabilidade|secret|leak|xss|sql injection|auditoria)\b/.test(lower)) {
    return {
      targetModule: 'security-center',
      reason: 'Auditoria de segurança e detecção de vulnerabilidades.',
      priority: 'HIGH',
      steps: ['Escanear arquivos por segredos e sinks', 'Classificar severidades', 'Gerar recomendações'],
    };
  }
  if (/\b(corrigir|auto.?heal|reparar|bug|erro|quebrado)\b/.test(lower)) {
    return {
      targetModule: 'quality-engine',
      reason: 'Diagnóstico e reparo automático de código.',
      priority: 'HIGH',
      steps: ['Criar backup de segurança', 'Executar 10 validadores + Self-Healing', 'Aplicar correções seguras'],
    };
  }
  if (/\b(teste|unit|testar|aceita[çc][ãa]o)\b/.test(lower)) {
    return {
      targetModule: 'test-lab',
      reason: 'Execução de testes automatizados e verificação.',
      priority: 'NORMAL',
      steps: ['Executar suíte real no sandbox', 'Validar APIs', 'Emitir relatório PASSED/FAILED/NOT_EXECUTED'],
    };
  }
  if (/\b(projeto|fullstack|multi-arquivo|estrutura completa)\b/.test(lower)) {
    return {
      targetModule: 'project-builder',
      reason: 'Arquitetura multi-arquivo solicitada.',
      priority: 'NORMAL',
      steps: ['Planejar estrutura completa', 'Gerar arquivos sem placeholders', 'Salvar no Workspace'],
    };
  }
  return {
    targetModule: 'script-studio',
    reason: 'Geração de script direto ou programa universal.',
    priority: 'NORMAL',
    steps: ['Detectar linguagem e modo single-file', 'Gerar e testar no sandbox', 'Validar entrega'],
  };
}
