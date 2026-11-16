import type {
  AiProviderConfigSummary,
  AiRequestHistoryEntry,
  DeliveryMode,
  DeployConfigBundle,
  DeployEnvironment,
  DeployProviderId,
  DnsTlsProbeResult,
  GeneratedFileItem,
  IntegrationStatus,
  MemoryKnowledgeItem,
  MemorySnapshotSummary,
  NeuralModelStatus,
  OrchestratorPlanResult,
  PerformanceMetricsSnapshot,
  ProjectType,
  QueueJob,
  QueuePriority,
  ScriptTransformResult,
  SecurityFinding,
  SelfHealingReport,
  SystemCapabilities,
  TestLabReport,
  GitRepoStatus,
} from '../shared/titanTypes.ts';
import { auth } from './firebase.ts';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Autenticação necessária para acessar o motor TITAN CODE.');
  }
  const token = await user.getIdToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

async function apiRequest<T>(url: string, options: RequestInit & { requireAuth?: boolean } = {}): Promise<T> {
  const { requireAuth = true, ...fetchOpts } = options;
  const headers = requireAuth
    ? await getAuthHeaders()
    : { 'Content-Type': 'application/json' };

  const resp = await fetch(url, {
    ...fetchOpts,
    headers: {
      ...headers,
      ...(fetchOpts.headers || {}),
    },
  });

  const data = (await resp.json().catch(() => ({}))) as T & { error?: string; detail?: string };
  if (!resp.ok) {
    throw new Error(data.error ? `${data.error}${data.detail ? ` (${data.detail})` : ''}` : `HTTP ${resp.status}`);
  }
  return data;
}

export async function fetchCapabilities(): Promise<SystemCapabilities> {
  return apiRequest<SystemCapabilities>('/api/titan/capabilities', {
    method: 'GET',
    requireAuth: false,
  });
}

export async function generateWithPipeline(payload: {
  module: 'script-studio' | 'project-builder' | 'code-generator' | 'luau-lab' | 'apk-builder';
  prompt: string;
  explicitLanguage?: string;
  explicitEnvironment?: string;
  deliveryMode?: DeliveryMode;
  projectTypeOverride?: ProjectType;
  enqueue?: boolean;
  priority?: QueuePriority;
  apkConfig?: {
    appName: string;
    packageName: string;
    versionName: string;
    versionCode: number;
    orientation: string;
    permissions: string[];
  };
}) {
  return apiRequest('/api/titan/generate', {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<import('../shared/titanTypes.ts').GenerationResult & { queued?: boolean; job?: QueueJob }>;
}

export async function sendAiChat(payload: {
  mode: 'core-ai' | 'admin-ai' | 'agent';
  message: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  workspaceContext?: string;
  adminKnowledge?: Array<{ title: string; category: string; content: string }>;
  agentProfile?: { id: string; name: string; objective: string; instructions: string };
  systemMetricsSummary?: string;
  preferredProviderId?: string;
}): Promise<{ reply: string; modelUsed: string; providerId?: string; blocked?: boolean }> {
  return apiRequest('/api/titan/chat', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function streamAiChat(
  payload: {
    mode: 'core-ai' | 'admin-ai' | 'agent';
    message: string;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
    workspaceContext?: string;
    adminKnowledge?: Array<{ title: string; category: string; content: string }>;
    agentProfile?: { id: string; name: string; objective: string; instructions: string };
    systemMetricsSummary?: string;
    preferredProviderId?: string;
  },
  onDelta: (delta: string) => void,
): Promise<{ reply: string; modelUsed: string; providerId?: string; blocked?: boolean }> {
  const headers = await getAuthHeaders();
  const resp = await fetch('/api/titan/chat/stream', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!resp.ok || !resp.body) {
    const errJson = (await resp.json().catch(() => ({}))) as { error?: string; detail?: string };
    throw new Error(errJson.error || `HTTP ${resp.status}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let accumulated = '';
  let finalMeta: { reply?: string; modelUsed?: string; providerId?: string; blocked?: boolean; error?: string } = {};

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';
    for (const ev of events) {
      const dataLine = ev.split('\n').find((l) => l.startsWith('data: '));
      if (!dataLine) continue;
      try {
        const parsed = JSON.parse(dataLine.slice(6)) as {
          delta?: string;
          done?: boolean;
          reply?: string;
          modelUsed?: string;
          providerId?: string;
          blocked?: boolean;
          error?: string;
        };
        if (parsed.delta) {
          accumulated += parsed.delta;
          onDelta(parsed.delta);
        }
        if (parsed.done) {
          finalMeta = parsed;
        }
      } catch {
        // ignore partial JSON frame
      }
    }
  }

  if (finalMeta.error && !accumulated && !finalMeta.reply) {
    throw new Error(finalMeta.error);
  }

  return {
    reply: finalMeta.reply || accumulated,
    modelUsed: finalMeta.modelUsed || 'TITAN-Neural-Core-v1',
    providerId: finalMeta.providerId,
    blocked: finalMeta.blocked,
  };
}

export async function executeInSandbox(payload: {
  language: string;
  code: string;
  stdin?: string;
  syntaxOnly?: boolean;
}): Promise<{
  executed: boolean;
  syntaxValid: boolean;
  runtime: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  limitationReason?: string;
}> {
  return apiRequest('/api/titan/execute', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function analyzeCode(payload: {
  code: string;
  language: string;
  useAi: boolean;
}): Promise<{
  staticIssues: Array<{ line: number; severity: 'info' | 'warning' | 'error' | 'critical'; rule: string; message: string }>;
  unusedVars: string[];
  securityFindings: string[];
  aiReview?: string;
}> {
  return apiRequest('/api/titan/analyze', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function executeApiProxy(payload: {
  url: string;
  method: string;
  headers: Record<string, string>;
  requestBody?: string;
}): Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  latencyMs: number;
  headers: Record<string, string>;
  body: string;
}> {
  return apiRequest('/api/titan/api-proxy', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function runServerTestSuite() {
  return apiRequest<{
    executedAt: string;
    results: Array<{
      id: string;
      name: string;
      status: string;
      language: string;
      environment: string;
      filesCount: number;
      validators: import('../shared/titanTypes.ts').GenerationResult['validators'];
      executionEvidence?: import('../shared/titanTypes.ts').GenerationResult['executionEvidence'];
      limitations?: string[];
    }>;
  }>('/api/titan/run-test-suite', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

// --- Expansion API Clients ---

export async function fetchAiProviders(): Promise<{
  providers: AiProviderConfigSummary[];
  history: AiRequestHistoryEntry[];
}> {
  return apiRequest('/api/titan/providers', { method: 'GET' });
}

export async function configureAiProvider(payload: {
  id: string;
  model?: string;
  baseUrl?: string;
  enabled?: boolean;
  priority?: number;
  apiKey?: string;
}): Promise<AiProviderConfigSummary> {
  return apiRequest('/api/titan/providers/configure', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function testAiProvider(id: string): Promise<{
  ok: boolean;
  status: IntegrationStatus;
  latencyMs: number;
  detail: string;
}> {
  return apiRequest('/api/titan/providers/test', {
    method: 'POST',
    body: JSON.stringify({ id }),
  });
}

export async function fetchIntegrationsStatus(): Promise<{
  vault: Array<{ slot: string; source: 'env' | 'vault' | 'none'; configured: boolean }>;
  providers: AiProviderConfigSummary[];
  firebaseConfigured: boolean;
  gitAvailable?: boolean;
}> {
  return apiRequest('/api/titan/integrations/status', { method: 'GET' });
}

export async function saveVaultSecret(slot: string, value: string): Promise<{
  ok: boolean;
  vault: Array<{ slot: string; source: 'env' | 'vault' | 'none'; configured: boolean }>;
}> {
  return apiRequest('/api/titan/integrations/vault', {
    method: 'POST',
    body: JSON.stringify({ slot, value }),
  });
}

export async function analyzeDeployProject(payload: {
  projectName: string;
  files: Array<{ path: string; content: string; language: string }>;
  environment: DeployEnvironment;
  provider: DeployProviderId;
}): Promise<DeployConfigBundle> {
  return apiRequest('/api/titan/deploy/analyze', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function testDeployProvider(provider: DeployProviderId): Promise<{
  provider: DeployProviderId;
  status: IntegrationStatus;
  detail: string;
  latencyMs: number;
}> {
  return apiRequest('/api/titan/deploy/test-provider', {
    method: 'POST',
    body: JSON.stringify({ provider }),
  });
}

export async function verifyDnsAndTls(domain: string): Promise<DnsTlsProbeResult> {
  return apiRequest('/api/titan/deploy/verify-dns', {
    method: 'POST',
    body: JSON.stringify({ domain }),
  });
}

export async function triggerRemoteDeploy(payload: {
  provider: DeployProviderId;
  projectName: string;
  files: Array<{ path: string; content: string }>;
  environment: DeployEnvironment;
}): Promise<{ ok: boolean; status: 'ONLINE' | 'FAILED' | 'PREPARING'; url?: string; logs: string[] }> {
  return apiRequest('/api/titan/deploy/trigger', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchPerformanceMetrics(): Promise<PerformanceMetricsSnapshot> {
  return apiRequest('/api/titan/metrics', { method: 'GET' });
}

export async function clearServerCache(): Promise<{ ok: boolean; clearedEntries: number }> {
  return apiRequest('/api/titan/cache/clear', { method: 'POST', body: JSON.stringify({}) });
}

export async function runSelfHealing(payload: {
  files: GeneratedFileItem[];
  applySafeFixes?: boolean;
  useAiFix?: boolean;
}): Promise<SelfHealingReport> {
  return apiRequest('/api/titan/self-heal', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function orchestrateTask(prompt: string, autoQueue = false): Promise<OrchestratorPlanResult> {
  return apiRequest('/api/titan/orchestrate', {
    method: 'POST',
    body: JSON.stringify({ prompt, autoQueue }),
  });
}

export async function fetchGitStatus(): Promise<GitRepoStatus> {
  return apiRequest('/api/titan/git/status', { method: 'GET' });
}

export async function fetchGithubRepos(): Promise<{
  repos: Array<{
    id: number;
    fullName: string;
    private: boolean;
    defaultBranch: string;
    htmlUrl: string;
    updatedAt: string;
  }>;
}> {
  return apiRequest('/api/titan/git/repos', { method: 'GET' });
}

export async function inspectGithubRepo(ownerRepo: string): Promise<{
  commits: Array<{ sha: string; message: string; author: string; date: string }>;
  branches: string[];
  pulls: Array<{ number: number; title: string; state: string; author: string }>;
}> {
  return apiRequest('/api/titan/git/inspect', {
    method: 'POST',
    body: JSON.stringify({ ownerRepo }),
  });
}

export async function createGitSnapshot(payload: {
  files: Array<{ path: string; content: string; language: string }>;
  commitMessage: string;
  branchName?: string;
}): Promise<{ commitHash: string; branch: string; diffStat: string; logOutput: string }> {
  return apiRequest('/api/titan/git/snapshot', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function cloneGithubRepository(ownerRepo: string, branch = 'main'): Promise<{
  files: GeneratedFileItem[];
}> {
  return apiRequest('/api/titan/git/clone', {
    method: 'POST',
    body: JSON.stringify({ ownerRepo, branch }),
  });
}

export async function runTestLab(files?: GeneratedFileItem[]): Promise<TestLabReport> {
  return apiRequest('/api/titan/test-lab/run', {
    method: 'POST',
    body: JSON.stringify({ files }),
  });
}

export async function runSecurityScan(files: Array<{ path: string; content: string }>): Promise<{
  scannedFiles: number;
  findings: SecurityFinding[];
  scannedAt: string;
}> {
  return apiRequest('/api/titan/security/scan', {
    method: 'POST',
    body: JSON.stringify({ files }),
  });
}

export async function fetchQueueJobs(): Promise<{
  jobs: QueueJob[];
  counts: { queued: number; running: number };
}> {
  return apiRequest('/api/titan/queue', { method: 'GET' });
}

export async function cancelQueuedJob(id: string): Promise<QueueJob> {
  return apiRequest(`/api/titan/queue/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function resetFinishedQueueJobs(): Promise<{ removed: number }> {
  return apiRequest('/api/titan/queue/reset', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

// --- Autonomous TITAN Neural Core & Script Studio 2.0 APIs ---

export async function transformScript(payload: {
  action: 'explain' | 'fix' | 'optimize' | 'convert' | 'format';
  code: string;
  sourceLanguage: string;
  targetLanguage?: string;
  errorHint?: string;
}): Promise<ScriptTransformResult> {
  return apiRequest('/api/titan/script/transform', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchNeuralStatus(): Promise<{
  model: NeuralModelStatus;
  memory: {
    currentVersion: number;
    entriesCount: number;
    errorFixesCount: number;
    evaluationsCount: number;
    snapshotsCount: number;
    latestEvaluation: { loss: number; perplexity: number; syntaxPassRate: number; evaluatedAt: string } | null;
  };
}> {
  return apiRequest('/api/titan/neural/status', { method: 'GET' });
}

export async function trainNeuralModel(payload: {
  epochs?: number;
  learningRate?: number;
  focusLanguage?: string;
}): Promise<{
  ok: boolean;
  metrics: {
    epochsRan: number;
    stepsExecuted: number;
    lossBefore: number;
    lossAfter: number;
    perplexityBefore: number;
    perplexityAfter: number;
    durationMs: number;
    checkpointChecksum: string;
  };
  model: NeuralModelStatus;
}> {
  return apiRequest('/api/titan/neural/train', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchNeuralMemory(): Promise<{
  currentVersion: number;
  entries: MemoryKnowledgeItem[];
  errorFixes: Array<{
    id: string;
    language: string;
    errorSignature: string;
    rootCause: string;
    fixDescription: string;
    verifiedCount: number;
    createdAt: string;
  }>;
  evaluations: Array<{
    id: string;
    modelVersion: string;
    loss: number;
    perplexity: number;
    syntaxPassRate: number;
    testedCases: number;
    evaluatedAt: string;
  }>;
  snapshots: MemorySnapshotSummary[];
  auditTrail: Array<{ id: string; action: string; detail: string; timestamp: string }>;
}> {
  return apiRequest('/api/titan/neural/memory', { method: 'GET' });
}

export async function learnNeuralMemory(payload: {
  kind: 'pattern' | 'error-fix' | 'admin-rule' | 'language-spec';
  language: string;
  title: string;
  content: string;
  fixAfter?: string;
  tags?: string[];
}): Promise<{ ok: boolean; entry: MemoryKnowledgeItem }> {
  return apiRequest('/api/titan/neural/memory/learn', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function rollbackNeuralMemory(versionId: string): Promise<{
  ok: boolean;
  restoredEntries: number;
  version: number;
}> {
  return apiRequest('/api/titan/neural/memory/rollback', {
    method: 'POST',
    body: JSON.stringify({ versionId }),
  });
}

