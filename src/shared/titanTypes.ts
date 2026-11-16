export type TaskState =
  | 'PLANNING'
  | 'GENERATING'
  | 'IMPLEMENTING'
  | 'VALIDATING'
  | 'TESTING'
  | 'NEEDS_CORRECTION'
  | 'COMPLETED'
  | 'BLOCKED';

export type DeliveryMode = 'auto' | 'single-file' | 'multi-file';

export type ProjectType =
  | 'script'
  | 'luau'
  | 'android'
  | 'web'
  | 'api'
  | 'fullstack'
  | 'single-file';

export type FileKind =
  | 'Script'
  | 'LocalScript'
  | 'ModuleScript'
  | 'Source'
  | 'Config'
  | 'Manifest'
  | 'Doc';

export type NavSectionId =
  | 'dashboard'
  | 'titan-ai'
  | 'script-studio'
  | 'project-builder'
  | 'code-generator'
  | 'luau-lab'
  | 'apk-builder'
  | 'web-studio'
  | 'database-studio'
  | 'api-studio'
  | 'debugger'
  | 'toolbox'
  | 'deploy-center'
  | 'web-to-apk'
  | 'performance-engine'
  | 'quality-engine'
  | 'control-center'
  | 'ai-orchestrator'
  | 'test-lab'
  | 'security-center'
  | 'git-control'
  | 'cloud-files'
  | 'automation-center'
  | 'integrations-center'
  | 'agents'
  | 'workspace'
  | 'administration'
  | 'settings';

export type ValidatorName =
  | 'LanguageMatchValidator'
  | 'RequirementMatchValidator'
  | 'CodeCompletenessValidator'
  | 'SingleFileValidator'
  | 'ProjectCompletenessValidator'
  | 'DependencyValidator'
  | 'SyntaxValidator'
  | 'BuildValidator'
  | 'TestValidator'
  | 'FinalDeliveryValidator';

export interface ValidatorResult {
  name: ValidatorName;
  passed: boolean;
  executed: boolean;
  severity: 'pass' | 'warning' | 'error' | 'blocked';
  message: string;
  details?: string[];
}

export interface GeneratedFileItem {
  path: string;
  content: string;
  language: string;
  fileKind: FileKind;
  description?: string;
}

export interface PipelineStepLog {
  state: TaskState;
  timestamp: string;
  detail: string;
}

export interface GenerationPlan {
  objective: string;
  language: string;
  environment: string;
  architecture: string;
  deliveryMode: 'single-file' | 'multi-file';
  singleFileReason?: string;
  dependencies: string[];
  plannedFiles: string[];
  testCriteria: string[];
}

export interface GenerationResult {
  taskId: string;
  status: TaskState;
  plan: GenerationPlan;
  files: GeneratedFileItem[];
  explanation: string;
  validators: ValidatorResult[];
  pipelineLogs: PipelineStepLog[];
  repairAttempts: number;
  executionEvidence?: {
    executed: boolean;
    runtime: string;
    exitCode: number | null;
    stdout: string;
    stderr: string;
    durationMs: number;
  };
  limitations?: string[];
  modelUsed: string;
  providerUsed?: string;
  tokenEstimate?: number;
  durationMs?: number;
  neuralTelemetry?: {
    modelVersion: string;
    parameterCount: number;
    retrievedMemories: number;
    validationScore: number;
  };
}

export interface SystemCapabilities {
  nodeVersion: string;
  pythonAvailable: boolean;
  pythonVersion: string | null;
  bashAvailable?: boolean;
  perlAvailable?: boolean;
  sqlEngineAvailable?: boolean;
  gitAvailable?: boolean;
  gitVersion?: string | null;
  neuralCoreReady: boolean;
  externalAiDependencyRemoved: boolean;
  androidSdkAvailable: boolean;
  gradleAvailable: boolean;
  javaAvailable: boolean;
  firebaseConfigured: boolean;
  modelName: string;
  supportedLanguagesCount?: number;
  activeProviders?: string[];
}

export interface NeuralModelStatus {
  modelId: string;
  version: string;
  architecture: string;
  vocabSize: number;
  dModel: number;
  nHeads: number;
  nLayers: number;
  dFf: number;
  maxSeqLen: number;
  parameterCount: number;
  trainingSteps: number;
  epochsCompleted: number;
  initialLoss: number;
  currentLoss: number;
  perplexity: number;
  corpusSamples: number;
  lastTrainedAt: string;
  checkpointPath: string;
  persistedOnDisk: boolean;
  externalAiDependencies: string[];
  capacityDisclosure: string;
}

export interface MemoryKnowledgeItem {
  id: string;
  kind: 'pattern' | 'error-fix' | 'admin-rule' | 'language-spec' | 'evaluation';
  language: string;
  title: string;
  content: string;
  fixAfter?: string;
  tags: string[];
  validated: boolean;
  version: number;
  createdAt: string;
}

export interface MemorySnapshotSummary {
  versionId: string;
  reason: string;
  entriesCount: number;
  modelVersion: string;
  createdAt: string;
}

export interface ScriptTransformResult {
  action: 'explain' | 'fix' | 'optimize' | 'convert' | 'format';
  sourceLanguage: string;
  targetLanguage: string;
  originalCode: string;
  transformedCode: string;
  explanation: string;
  diagnostics: Array<{ line?: number; severity: 'info' | 'warning' | 'error'; message: string }>;
  diff: string;
  validators: ValidatorResult[];
  fixedCount?: number;
}

export interface WorkspaceProjectDoc {
  id: string;
  ownerId: string;
  name: string;
  description?: string;
  projectType: ProjectType;
  language: string;
  environment: string;
  status: TaskState;
  filesCount: number;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface ProjectFileDoc {
  id: string;
  projectId: string;
  ownerId: string;
  path: string;
  content: string;
  language: string;
  fileKind: FileKind;
  version: number;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface ProjectMemoryDoc {
  id: string;
  projectId: string;
  ownerId: string;
  decisionTitle: string;
  requirements: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface AiSessionDoc {
  id: string;
  ownerId: string;
  module: 'core-ai' | 'admin-ai' | 'script-studio' | 'project-builder' | 'luau-lab' | 'agent' | 'orchestrator';
  title: string;
  agentId?: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface AiMessageDoc {
  id: string;
  sessionId: string;
  ownerId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  modelUsed?: string;
  createdAt: unknown;
}

export interface AdminKnowledgeDoc {
  id: string;
  authorId: string;
  title: string;
  category: string;
  content: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface AutomationJobDoc {
  id: string;
  ownerId: string;
  name: string;
  actionType:
    | 'static-analysis'
    | 'auto-fix'
    | 'format'
    | 'test-suite'
    | 'docs-gen'
    | 'project-audit'
    | 'security-scan'
    | 'backup-sync';
  targetProjectId?: string;
  status: 'IDLE' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  lastRunSummary?: string;
  runCount: number;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface AuditLogDoc {
  id: string;
  actorId: string;
  module: string;
  action: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  detail: string;
  createdAt: unknown;
}

export interface TaskExecutionDoc {
  id: string;
  ownerId: string;
  module: string;
  prompt: string;
  language: string;
  environment: string;
  status: TaskState;
  validationSummary?: string;
  createdAt: unknown;
  updatedAt: unknown;
}

// --- Expansion Phase Types (Phases 1 - 24) ---

export type IntegrationStatus =
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'CONFIGURATION_REQUIRED'
  | 'AUTHENTICATION_ERROR'
  | 'SERVICE_UNAVAILABLE';

export type AiProviderKind = 'gemini' | 'openai' | 'anthropic' | 'openrouter' | 'ollama' | 'custom';

export interface AiProviderConfigSummary {
  id: string;
  kind: AiProviderKind;
  name: string;
  model: string;
  baseUrl?: string;
  enabled: boolean;
  priority: number;
  hasCredential: boolean;
  status: IntegrationStatus;
  lastCheckedAt?: string;
  lastError?: string;
  requestCount: number;
  estimatedTokens: number;
}

export interface AiRequestHistoryEntry {
  id: string;
  providerId: string;
  providerName: string;
  model: string;
  taskType: string;
  success: boolean;
  latencyMs: number;
  estimatedTokens: number;
  error?: string;
  timestamp: string;
}

export type DeployProviderId = 'render' | 'railway' | 'vercel' | 'netlify' | 'cloudflare' | 'docker-vps';

export type DeployStatus =
  | 'NOT_DEPLOYED'
  | 'PREPARING'
  | 'BUILDING'
  | 'DEPLOYING'
  | 'ONLINE'
  | 'FAILED'
  | 'ROLLING_BACK'
  | 'SUSPENDED';

export type DeployEnvironment = 'production' | 'staging' | 'preview';

export interface DeploymentDoc {
  id: string;
  ownerId: string;
  projectId: string;
  projectName: string;
  provider: DeployProviderId;
  environment: DeployEnvironment;
  status: DeployStatus;
  url?: string;
  domain?: string;
  version: string;
  logsSummary?: string;
  responseTimeMs?: number;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface DeployAnalysisStep {
  step: number;
  name: string;
  status: 'PASSED' | 'FAILED' | 'SKIPPED' | 'WARNING';
  detail: string;
}

export interface DeployConfigBundle {
  detectedStack: string;
  startCommand: string;
  buildCommand: string;
  recommendedPort: number;
  steps: DeployAnalysisStep[];
  files: GeneratedFileItem[];
  limitations: string[];
}

export interface DnsTlsProbeResult {
  domain: string;
  dnsResolved: boolean;
  addresses: string[];
  httpsReachable: boolean;
  httpStatus: number | null;
  responseTimeMs: number | null;
  tlsValid: boolean;
  tlsSubject?: string;
  tlsIssuer?: string;
  tlsExpiresAt?: string;
  error?: string;
  checkedAt: string;
}

export interface BackupDoc {
  id: string;
  ownerId: string;
  projectId: string;
  projectName: string;
  label: string;
  sha256: string;
  filesCount: number;
  payloadJson: string;
  createdAt: unknown;
}

export type QueuePriority = 'HIGH' | 'NORMAL' | 'LOW';
export type QueueJobStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface QueueJob {
  id: string;
  ownerId: string;
  type: 'ai-generate' | 'self-heal' | 'deploy' | 'test-suite' | 'security-scan' | 'git-sync';
  title: string;
  priority: QueuePriority;
  status: QueueJobStatus;
  progress: number;
  retries: number;
  maxRetries: number;
  timeoutMs: number;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  result?: unknown;
  error?: string;
}

export interface PerformanceMetricsSnapshot {
  uptimeSec: number;
  memoryRssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  cpuLoad1m: number;
  totalRequests: number;
  errorRequests: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  cacheEntries: number;
  cacheHits: number;
  cacheMisses: number;
  queueQueued: number;
  queueRunning: number;
  lastBuildCheckMs: number | null;
  lastExecutionMs: number | null;
  collectedAt: string;
}

export interface SelfHealingFinding {
  id: string;
  category: 'runtime' | 'dependency' | 'syntax' | 'config' | 'integration' | 'performance';
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  cause: string;
  proposedAction: string;
  autoFixSafe: boolean;
  requiresAdminApproval: boolean;
  fixed: boolean;
  detail: string;
}

export interface SelfHealingReport {
  id: string;
  executedAt: string;
  stages: Array<{
    stage: 'DETECÇÃO' | 'DIAGNÓSTICO' | 'CAUSA' | 'PROPOSTA' | 'VALIDAÇÃO' | 'RECUPERAÇÃO';
    status: 'OK' | 'WARNING' | 'FIXED' | 'BLOCKED';
    summary: string;
  }>;
  findings: SelfHealingFinding[];
  fixedFiles?: GeneratedFileItem[];
  limitations: string[];
}

export type TestExecutionStatus = 'PASSED' | 'FAILED' | 'NOT_EXECUTED';

export interface TestCaseResult {
  id: string;
  name: string;
  category: 'unit' | 'api' | 'static' | 'accessibility' | 'build' | 'acceptance';
  status: TestExecutionStatus;
  durationMs: number;
  evidence: string;
}

export interface TestLabReport {
  executedAt: string;
  passedCount: number;
  failedCount: number;
  notExecutedCount: number;
  tests: TestCaseResult[];
}

export interface SecurityFinding {
  id: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  category: 'secret-leak' | 'injection' | 'xss' | 'rbac' | 'dependency' | 'transport';
  filePath: string;
  line?: number;
  title: string;
  recommendation: string;
}

export interface GitRepoStatus {
  gitInstalled: boolean;
  gitVersion: string | null;
  workspaceInitialized: boolean;
  branch: string | null;
  lastCommit: string | null;
  githubConnected: boolean;
  githubUser?: string;
}

export interface OrchestratorPlanResult {
  targetModule: NavSectionId;
  reason: string;
  priority: QueuePriority;
  steps: string[];
  queuedJobId?: string;
}
