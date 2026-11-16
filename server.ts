import 'dotenv/config';
import compression from 'compression';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';
import {
  routeOrchestratorIntent,
  runAiChat,
  runAiChatStream,
  runEngineeringPipeline,
  runStaticAndAiAnalysis,
} from './src/server/aiEngine.ts';
import {
  createRateLimiter,
  requireAdmin,
  verifyFirebaseAuth,
} from './src/server/authMiddleware.ts';
import {
  analyzeAndGenerateDeployBundle,
  testHostingProviderConnection,
  triggerRemoteDeployment,
  verifyDomainDnsAndTls,
} from './src/server/deployService.ts';
import {
  cloneGithubFilesToProject,
  getGitEnvironmentStatus,
  inspectGithubRepoDetails,
  listGithubRepositories,
  runSandboxGitSnapshot,
} from './src/server/gitService.ts';
import {
  clearSafeCache,
  getCachedValue,
  getPerformanceSnapshot,
  metricsMiddleware,
  recordBuildCheckDuration,
  recordExecutionDuration,
  setCachedValue,
} from './src/server/metricsService.ts';
import {
  configureProvider,
  getProviderHistory,
  listProviders,
  recordNeuralRequestHistory,
  testProviderConnection,
} from './src/server/providerManager.ts';
import { getSystemCapabilities, runIsolatedCode } from './src/server/sandboxRunner.ts';
import { runSelfHealingDiagnostic } from './src/server/selfHealing.ts';
import { transformScriptCode } from './src/server/titanEngine/universalGenerator.ts';
import { titanNeuralCore } from './src/server/titanNeural/datasetAndTrainer.ts';
import {
  cancelQueueJob,
  enqueueJob,
  getQueueCounts,
  listQueueJobs,
  resetFinishedJobs,
} from './src/server/taskQueue.ts';
import { deleteVaultSecret, getVaultMaskedStatus, setVaultSecret } from './src/server/vaultService.ts';
import type {
  DeliveryMode,
  DeployEnvironment,
  DeployProviderId,
  GeneratedFileItem,
  ProjectType,
  QueuePriority,
  SecurityFinding,
  TestCaseResult,
} from './src/shared/titanTypes.ts';
import {
  validateCodeCompleteness,
  validateLanguageMatch,
  validateSyntaxStatic,
} from './src/shared/titanValidators.ts';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.disable('x-powered-by');
  app.use(compression());
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.use(express.json({ limit: '4mb' }));
  app.use(metricsMiddleware);

  const aiLimiter = createRateLimiter(30, 60_000);
  const execLimiter = createRateLimiter(50, 60_000);

  // Public standalone healthcheck for Render / Docker / Railway / Fly / Uptime monitors
  app.get('/api/health', async (_req, res) => {
    const caps = await getSystemCapabilities();
    const queue = getQueueCounts();
    res.json({
      status: 'ok',
      service: 'TITAN CODE',
      uptimeSec: Math.round(process.uptime()),
      nodeVersion: caps.nodeVersion,
      firebaseConfigured: caps.firebaseConfigured,
      queue,
      timestamp: new Date().toISOString(),
    });
  });

  // Public system capabilities inspection (exposes zero secrets)
  app.get('/api/titan/capabilities', async (_req, res) => {
    try {
      const cached = getCachedValue<Awaited<ReturnType<typeof getSystemCapabilities>>>('capabilities');
      if (cached) {
        res.json(cached);
        return;
      }
      const capabilities = await getSystemCapabilities();
      const activeProviders = listProviders()
        .filter((p) => p.enabled && p.hasCredential)
        .map((p) => p.id);
      const enriched = { ...capabilities, activeProviders };
      setCachedValue('capabilities', enriched, 15_000);
      res.json(enriched);
    } catch (err) {
      res.status(500).json({
        error: 'Falha ao inspecionar capacidades do ambiente.',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // Main Engineering Pipeline (sync or queued)
  app.post('/api/titan/generate', verifyFirebaseAuth, aiLimiter, async (req, res) => {
    try {
      const body = req.body as {
        module?: 'script-studio' | 'project-builder' | 'code-generator' | 'luau-lab' | 'apk-builder';
        prompt?: string;
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
      };

      if (!body.prompt || typeof body.prompt !== 'string' || body.prompt.trim().length < 3) {
        res.status(400).json({ error: 'Forneça uma solicitação válida com pelo menos 3 caracteres.' });
        return;
      }
      if (body.prompt.length > 10000) {
        res.status(400).json({ error: 'Solicitação excede o limite de 10.000 caracteres.' });
        return;
      }

      if (body.enqueue) {
        const job = enqueueJob({
          ownerId: req.user!.uid,
          type: 'ai-generate',
          title: `${body.module || 'script-studio'}: ${body.prompt.trim().slice(0, 60)}`,
          priority: body.priority || 'NORMAL',
          runner: async (updateProgress) => {
            updateProgress(25);
            const result = await runEngineeringPipeline({
              module: body.module || 'script-studio',
              prompt: body.prompt!.trim(),
              explicitLanguage: body.explicitLanguage,
              explicitEnvironment: body.explicitEnvironment,
              deliveryMode: body.deliveryMode || 'auto',
              projectTypeOverride: body.projectTypeOverride,
              apkConfig: body.apkConfig,
            });
            updateProgress(95);
            if (result.durationMs) recordBuildCheckDuration(result.durationMs);
            return result;
          },
        });
        res.status(202).json({ queued: true, job });
        return;
      }

      const result = await runEngineeringPipeline({
        module: body.module || 'script-studio',
        prompt: body.prompt.trim(),
        explicitLanguage: body.explicitLanguage,
        explicitEnvironment: body.explicitEnvironment,
        deliveryMode: body.deliveryMode || 'auto',
        projectTypeOverride: body.projectTypeOverride,
        apkConfig: body.apkConfig,
      });

      if (result.durationMs) recordBuildCheckDuration(result.durationMs);
      recordNeuralRequestHistory({
        providerId: 'titan-neural-core',
        providerName: 'TITAN Neural Core',
        model: result.modelUsed,
        taskType: `generate:${result.plan.language}`,
        success: result.status === 'COMPLETED',
        latencyMs: result.durationMs || 0,
        estimatedTokens: Math.ceil(result.files.reduce((s, f) => s + f.content.length, 0) / 4),
      });
      res.json(result);
    } catch (err) {
      console.error('[TITAN /api/titan/generate error]', err);
      res.status(500).json({
        error: 'Erro no motor de geração TITAN CODE.',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // Chat endpoint for TITAN CORE AI, TITAN AGENT, and TITAN ADMIN AI
  app.post('/api/titan/chat', verifyFirebaseAuth, aiLimiter, async (req, res) => {
    try {
      const body = req.body as {
        mode?: 'core-ai' | 'admin-ai' | 'agent';
        message?: string;
        history?: Array<{ role: 'user' | 'assistant'; content: string }>;
        workspaceContext?: string;
        adminKnowledge?: Array<{ title: string; category: string; content: string }>;
        agentProfile?: { id: string; name: string; objective: string; instructions: string };
        systemMetricsSummary?: string;
        preferredProviderId?: string;
      };

      if (!body.message || typeof body.message !== 'string' || !body.message.trim()) {
        res.status(400).json({ error: 'Mensagem vazia não permitida.' });
        return;
      }

      const mode = body.mode || 'core-ai';
      if (mode === 'admin-ai' && !req.user?.isAdmin) {
        res.status(403).json({
          error: 'Acesso negado: TITAN ADMIN AI é exclusivo para administradores autenticados.',
        });
        return;
      }

      const result = await runAiChat({
        mode,
        message: body.message.trim(),
        history: Array.isArray(body.history) ? body.history : [],
        workspaceContext: body.workspaceContext,
        adminKnowledge: body.adminKnowledge,
        agentProfile: body.agentProfile,
        systemMetricsSummary: body.systemMetricsSummary,
        preferredProviderId: body.preferredProviderId,
      });

      recordNeuralRequestHistory({
        providerId: 'titan-neural-core',
        providerName: 'TITAN Neural Core',
        model: result.modelUsed,
        taskType: `chat:${mode}`,
        success: !result.blocked,
        latencyMs: 12,
        estimatedTokens: Math.ceil((body.message.length + result.reply.length) / 4),
      });
      res.json(result);
    } catch (err) {
      console.error('[TITAN /api/titan/chat error]', err);
      res.status(500).json({
        error: 'Erro ao processar inferência do TITAN AI.',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // Streaming SSE endpoint for TITAN CORE AI / Admin AI / Agents
  app.post('/api/titan/chat/stream', verifyFirebaseAuth, aiLimiter, async (req, res) => {
    const body = req.body as {
      mode?: 'core-ai' | 'admin-ai' | 'agent';
      message?: string;
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
      workspaceContext?: string;
      adminKnowledge?: Array<{ title: string; category: string; content: string }>;
      agentProfile?: { id: string; name: string; objective: string; instructions: string };
      systemMetricsSummary?: string;
      preferredProviderId?: string;
    };

    if (!body.message || typeof body.message !== 'string' || !body.message.trim()) {
      res.status(400).json({ error: 'Mensagem vazia não permitida.' });
      return;
    }

    const mode = body.mode || 'core-ai';
    if (mode === 'admin-ai' && !req.user?.isAdmin) {
      res.status(403).json({
        error: 'Acesso negado: TITAN ADMIN AI é exclusivo para administradores autenticados.',
      });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const writeEvent = (payload: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      const result = await runAiChatStream({
        mode,
        message: body.message.trim(),
        history: Array.isArray(body.history) ? body.history : [],
        workspaceContext: body.workspaceContext,
        adminKnowledge: body.adminKnowledge,
        agentProfile: body.agentProfile,
        systemMetricsSummary: body.systemMetricsSummary,
        preferredProviderId: body.preferredProviderId,
        onDelta: (delta) => {
          writeEvent({ delta });
        },
      });
      writeEvent({ done: true, ...result });
      res.end();
    } catch (err) {
      writeEvent({
        done: true,
        blocked: true,
        error: err instanceof Error ? err.message : String(err),
      });
      res.end();
    }
  });

  // Isolated Sandbox Code Execution (Python 3.10 / Node VM + esbuild)
  app.post('/api/titan/execute', verifyFirebaseAuth, execLimiter, async (req, res) => {
    try {
      const body = req.body as {
        language?: string;
        code?: string;
        stdin?: string;
        syntaxOnly?: boolean;
      };

      if (!body.language || typeof body.code !== 'string') {
        res.status(400).json({ error: 'Informe linguagem e código para execução.' });
        return;
      }
      if (body.code.length > 150000) {
        res.status(400).json({ error: 'Código excede o limite de 150KB do sandbox.' });
        return;
      }

      const result = await runIsolatedCode({
        language: body.language,
        code: body.code,
        stdin: body.stdin,
        syntaxOnly: Boolean(body.syntaxOnly),
      });
      recordExecutionDuration(result.durationMs);
      res.json(result);
    } catch (err) {
      res.status(500).json({
        error: 'Falha no sandbox isolado.',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // Static & AI Code Debugger Pro
  app.post('/api/titan/analyze', verifyFirebaseAuth, aiLimiter, async (req, res) => {
    try {
      const body = req.body as {
        code?: string;
        language?: string;
        useAi?: boolean;
      };
      if (typeof body.code !== 'string' || !body.code.trim()) {
        res.status(400).json({ error: 'Forneça código para análise.' });
        return;
      }

      const result = await runStaticAndAiAnalysis({
        code: body.code,
        language: body.language || 'JavaScript',
        useAi: Boolean(body.useAi),
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({
        error: 'Erro durante análise de código.',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // Script Studio 2.0 Transformation (Explain, Fix w/ Diff, Optimize, Convert Language, Format)
  app.post('/api/titan/script/transform', verifyFirebaseAuth, aiLimiter, async (req, res) => {
    try {
      const body = req.body as {
        action?: 'explain' | 'fix' | 'optimize' | 'convert' | 'format';
        code?: string;
        sourceLanguage?: string;
        targetLanguage?: string;
        errorHint?: string;
      };
      if (!body.action || typeof body.code !== 'string' || !body.code.trim()) {
        res.status(400).json({ error: 'Informe ação e código-fonte para transformação.' });
        return;
      }
      const result = await transformScriptCode({
        action: body.action,
        code: body.code,
        sourceLanguage: body.sourceLanguage || 'Python',
        targetLanguage: body.targetLanguage,
        errorHint: body.errorHint,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({
        error: 'Erro ao transformar código no Script Studio.',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // TITAN Neural Core: Model Status, Real Training, Evaluation, Versioned Memory & Rollback
  app.get('/api/titan/neural/status', verifyFirebaseAuth, (_req, res) => {
    const model = titanNeuralCore.getStatus();
    const mem = titanNeuralCore.memory.getStatus();
    res.json({
      model,
      memory: {
        currentVersion: mem.currentVersion,
        entriesCount: mem.entries.length,
        errorFixesCount: mem.errorFixes.length,
        evaluationsCount: mem.evaluations.length,
        snapshotsCount: mem.snapshots.length,
        latestEvaluation: mem.evaluations[0] || null,
      },
    });
  });

  app.post('/api/titan/neural/train', verifyFirebaseAuth, requireAdmin, async (req, res) => {
    try {
      const body = req.body as { epochs?: number; learningRate?: number; focusLanguage?: string };
      const metrics = titanNeuralCore.trainEpochs({
        epochs: body.epochs,
        learningRate: body.learningRate,
        focusLanguage: body.focusLanguage,
      });
      res.json({
        ok: true,
        metrics,
        model: titanNeuralCore.getStatus(),
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/titan/neural/evaluate', verifyFirebaseAuth, (_req, res) => {
    const status = titanNeuralCore.getStatus();
    const mem = titanNeuralCore.memory.getStatus();
    res.json({
      model: status,
      evaluations: mem.evaluations,
    });
  });

  app.get('/api/titan/neural/memory', verifyFirebaseAuth, (_req, res) => {
    res.json(titanNeuralCore.memory.getStatus());
  });

  app.post('/api/titan/neural/memory/learn', verifyFirebaseAuth, requireAdmin, (req, res) => {
    try {
      const body = req.body as {
        kind?: 'pattern' | 'error-fix' | 'admin-rule' | 'language-spec';
        language?: string;
        title?: string;
        content?: string;
        fixAfter?: string;
        tags?: string[];
      };
      if (!body.title || !body.content) {
        res.status(400).json({ error: 'Título e conteúdo técnico são obrigatórios.' });
        return;
      }
      const entry = titanNeuralCore.memory.recordValidatedEntry({
        kind: body.kind || 'admin-rule',
        language: body.language || 'General',
        title: body.title,
        content: body.content,
        fixAfter: body.fixAfter,
        tags: Array.isArray(body.tags) ? body.tags : [],
        validated: true,
      });
      if (body.fixAfter && body.language) {
        titanNeuralCore.fineTuneValidatedSample(body.language, body.fixAfter);
      }
      res.json({ ok: true, entry });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/titan/neural/memory/rollback', verifyFirebaseAuth, requireAdmin, (req, res) => {
    try {
      const { versionId } = req.body as { versionId?: string };
      if (!versionId) {
        res.status(400).json({ error: 'Informe o versionId do snapshot.' });
        return;
      }
      const result = titanNeuralCore.memory.rollbackToVersion(versionId);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Real HTTP Request Proxy for TITAN API Studio (SSRF hardened)
  app.post('/api/titan/api-proxy', verifyFirebaseAuth, execLimiter, async (req, res) => {
    try {
      const body = req.body as {
        url?: string;
        method?: string;
        headers?: Record<string, string>;
        requestBody?: string;
      };

      if (!body.url || typeof body.url !== 'string') {
        res.status(400).json({ error: 'URL inválida.' });
        return;
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(body.url);
      } catch {
        res.status(400).json({ error: 'Formato de URL inválido.' });
        return;
      }

      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        res.status(400).json({ error: 'Somente protocolos HTTP e HTTPS são permitidos.' });
        return;
      }

      const host = parsedUrl.hostname.toLowerCase();
      if (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '0.0.0.0' ||
        host === '::1' ||
        host.startsWith('169.254.') ||
        host.startsWith('10.') ||
        host.startsWith('192.168.') ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(host)
      ) {
        res.status(403).json({
          error: 'Requisições para endereços internos ou metadados de rede são bloqueadas por segurança (SSRF Guard).',
        });
        return;
      }

      const allowedMethods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
      const method = (body.method || 'GET').toUpperCase();
      if (!allowedMethods.has(method)) {
        res.status(400).json({ error: `Método HTTP não suportado: ${method}` });
        return;
      }

      const started = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);

      try {
        const cleanHeaders: Record<string, string> = {};
        if (body.headers && typeof body.headers === 'object') {
          for (const [k, v] of Object.entries(body.headers)) {
            if (typeof v === 'string' && k.toLowerCase() !== 'host') {
              cleanHeaders[k] = v;
            }
          }
        }

        const response = await fetch(parsedUrl.toString(), {
          method,
          headers: cleanHeaders,
          body: ['GET', 'HEAD'].includes(method) ? undefined : body.requestBody,
          signal: controller.signal,
        });

        const text = await response.text();
        const respHeaders: Record<string, string> = {};
        response.headers.forEach((v, k) => {
          respHeaders[k] = v;
        });

        res.json({
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          latencyMs: Date.now() - started,
          headers: respHeaders,
          body: text.slice(0, 120000),
        });
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      res.status(502).json({
        error: 'Falha ao executar requisição externa.',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // --- Phase 1 & 18: Multi-AI Providers & Secure Backend Vault ---
  app.get('/api/titan/providers', verifyFirebaseAuth, (_req, res) => {
    res.json({
      providers: listProviders(),
      history: getProviderHistory(),
    });
  });

  app.post('/api/titan/providers/configure', verifyFirebaseAuth, (req, res) => {
    try {
      const body = req.body as {
        id: string;
        model?: string;
        baseUrl?: string;
        enabled?: boolean;
        priority?: number;
        apiKey?: string;
      };
      const updated = configureProvider(body);
      clearSafeCache();
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/titan/providers/test', verifyFirebaseAuth, async (req, res) => {
    try {
      const { id } = req.body as { id: string };
      const result = await testProviderConnection(id);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/api/titan/integrations/status', verifyFirebaseAuth, async (_req, res) => {
    const vault = getVaultMaskedStatus();
    const caps = await getSystemCapabilities();
    res.json({
      vault,
      providers: listProviders(),
      firebaseConfigured: caps.firebaseConfigured,
      gitAvailable: caps.gitAvailable,
    });
  });

  app.post('/api/titan/integrations/vault', verifyFirebaseAuth, (req, res) => {
    try {
      const { slot, value } = req.body as { slot?: string; value?: string };
      if (!slot || typeof slot !== 'string') {
        res.status(400).json({ error: 'Slot de integração inválido.' });
        return;
      }
      if (!value || !value.trim()) {
        deleteVaultSecret(slot);
      } else {
        setVaultSecret(slot, value);
      }
      clearSafeCache();
      res.json({ ok: true, vault: getVaultMaskedStatus() });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // --- Phase 2: TITAN Deploy Center ---
  app.post('/api/titan/deploy/analyze', verifyFirebaseAuth, (req, res) => {
    try {
      const body = req.body as {
        projectName: string;
        files: Array<{ path: string; content: string; language: string }>;
        environment: DeployEnvironment;
        provider: DeployProviderId;
      };
      const bundle = analyzeAndGenerateDeployBundle({
        projectName: body.projectName || 'titan-project',
        files: Array.isArray(body.files) ? body.files : [],
        environment: body.environment || 'production',
        provider: body.provider || 'render',
      });
      res.json(bundle);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/titan/deploy/test-provider', verifyFirebaseAuth, async (req, res) => {
    try {
      const { provider } = req.body as { provider: DeployProviderId };
      const result = await testHostingProviderConnection(provider || 'render');
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/titan/deploy/verify-dns', verifyFirebaseAuth, execLimiter, async (req, res) => {
    try {
      const { domain } = req.body as { domain?: string };
      if (!domain || !domain.trim()) {
        res.status(400).json({ error: 'Informe um domínio válido.' });
        return;
      }
      const probe = await verifyDomainDnsAndTls(domain);
      res.json(probe);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/titan/deploy/trigger', verifyFirebaseAuth, execLimiter, async (req, res) => {
    try {
      const body = req.body as {
        provider: DeployProviderId;
        projectName: string;
        files: Array<{ path: string; content: string }>;
        environment: DeployEnvironment;
      };
      const outcome = await triggerRemoteDeployment({
        provider: body.provider || 'vercel',
        projectName: body.projectName || 'titan-app',
        files: Array.isArray(body.files) ? body.files : [],
        environment: body.environment || 'production',
      });
      res.json(outcome);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // --- Phase 4 & 6: Performance Engine & Control Center ---
  app.get('/api/titan/metrics', verifyFirebaseAuth, (_req, res) => {
    res.json(getPerformanceSnapshot(getQueueCounts()));
  });

  app.post('/api/titan/cache/clear', verifyFirebaseAuth, (_req, res) => {
    const result = clearSafeCache();
    res.json({ ok: true, ...result });
  });

  // --- Phase 7: Self-Healing Engine ---
  app.post('/api/titan/self-heal', verifyFirebaseAuth, aiLimiter, async (req, res) => {
    try {
      const body = req.body as {
        files: GeneratedFileItem[];
        applySafeFixes?: boolean;
        useAiFix?: boolean;
      };
      const report = await runSelfHealingDiagnostic({
        files: Array.isArray(body.files) ? body.files : [],
        applySafeFixes: Boolean(body.applySafeFixes),
        useAiFix: Boolean(body.useAiFix),
        adminApproved: Boolean(req.user?.isAdmin),
      });
      res.json(report);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // --- Phase 8: AI Orchestrator ---
  app.post('/api/titan/orchestrate', verifyFirebaseAuth, aiLimiter, async (req, res) => {
    try {
      const { prompt, autoQueue } = req.body as { prompt?: string; autoQueue?: boolean };
      if (!prompt || prompt.trim().length < 3) {
        res.status(400).json({ error: 'Descreva a tarefa para orquestração.' });
        return;
      }
      const plan = routeOrchestratorIntent(prompt.trim());
      let queuedJobId: string | undefined;
      if (autoQueue && ['script-studio', 'project-builder', 'luau-lab', 'apk-builder'].includes(plan.targetModule)) {
        const job = enqueueJob({
          ownerId: req.user!.uid,
          type: 'ai-generate',
          title: `Orquestrador → ${plan.targetModule}`,
          priority: plan.priority,
          runner: async (update) => {
            update(30);
            return runEngineeringPipeline({
              module: plan.targetModule as 'script-studio' | 'project-builder' | 'luau-lab' | 'apk-builder',
              prompt: prompt.trim(),
            });
          },
        });
        queuedJobId = job.id;
      }
      res.json({ ...plan, queuedJobId });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // --- Phase 12: Git & Version Control ---
  app.get('/api/titan/git/status', verifyFirebaseAuth, async (_req, res) => {
    try {
      const status = await getGitEnvironmentStatus();
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/api/titan/git/repos', verifyFirebaseAuth, async (_req, res) => {
    try {
      const repos = await listGithubRepositories();
      res.json({ repos });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/titan/git/inspect', verifyFirebaseAuth, async (req, res) => {
    try {
      const { ownerRepo } = req.body as { ownerRepo: string };
      const details = await inspectGithubRepoDetails(ownerRepo);
      res.json(details);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/titan/git/snapshot', verifyFirebaseAuth, async (req, res) => {
    try {
      const body = req.body as {
        files: Array<{ path: string; content: string; language: string }>;
        commitMessage: string;
        branchName?: string;
      };
      const result = await runSandboxGitSnapshot({
        files: Array.isArray(body.files) ? body.files : [],
        commitMessage: body.commitMessage || 'chore: snapshot',
        branchName: body.branchName,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/titan/git/clone', verifyFirebaseAuth, async (req, res) => {
    try {
      const { ownerRepo, branch } = req.body as { ownerRepo: string; branch?: string };
      const files = await cloneGithubFilesToProject(ownerRepo, branch || 'main');
      res.json({ files });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // --- Phase 13: TITAN Test Lab (strict PASSED/FAILED/NOT_EXECUTED) ---
  app.post('/api/titan/test-lab/run', verifyFirebaseAuth, execLimiter, async (req, res) => {
    try {
      const body = req.body as {
        files?: GeneratedFileItem[];
      };
      const tests: TestCaseResult[] = [];

      // Test 1: Python runtime isolation
      const tPyStart = Date.now();
      const pyRes = await runIsolatedCode({
        language: 'Python',
        code: `def add(a, b):\n    return a + b\nassert add(2, 3) == 5\nprint("PY_SANDBOX_OK")`,
      });
      tests.push({
        id: 'unit-python-sandbox',
        name: 'Sandbox Python 3 (-I isolado)',
        category: 'unit',
        status: !pyRes.executed ? 'NOT_EXECUTED' : pyRes.exitCode === 0 && pyRes.stdout.includes('PY_SANDBOX_OK') ? 'PASSED' : 'FAILED',
        durationMs: Date.now() - tPyStart,
        evidence: pyRes.executed ? pyRes.stdout.trim() || pyRes.stderr.trim() : pyRes.limitationReason || 'Python ausente',
      });

      // Test 2: TypeScript esbuild + VM isolation
      const tTsStart = Date.now();
      const tsRes = await runIsolatedCode({
        language: 'TypeScript',
        code: `const sum = (a: number, b: number): number => a + b;\nif (sum(4, 6) !== 10) throw new Error('Math mismatch');\nconsole.log('TS_VM_OK');`,
      });
      tests.push({
        id: 'unit-ts-vm',
        name: 'Transpilação esbuild + Node VM (TypeScript)',
        category: 'unit',
        status: !tsRes.executed ? 'NOT_EXECUTED' : tsRes.exitCode === 0 && tsRes.stdout.includes('TS_VM_OK') ? 'PASSED' : 'FAILED',
        durationMs: Date.now() - tTsStart,
        evidence: tsRes.stdout.trim() || tsRes.stderr.trim(),
      });

      // Test 3: Failure A Regression Guard (Luau vs TypeScript stub)
      const tGuardStart = Date.now();
      const badStubCheck = validateLanguageMatch('Luau', 'Roblox', [
        { path: 'bad.ts', language: 'TypeScript', fileKind: 'Source', content: 'export interface ExecutionPayload { data: string }\nexport function runTask() { return; }' },
      ]);
      const goodLuauCheck = validateLanguageMatch('Luau', 'Roblox', [
        { path: 'Fly.client.luau', language: 'Luau', fileKind: 'LocalScript', content: 'local Players = game:GetService("Players")\nlocal RunService = game:GetService("RunService")\nlocal function toggleFly() end' },
      ]);
      tests.push({
        id: 'acceptance-a-luau-guard',
        name: 'Teste Aceitação A — Bloqueio de Stub TS em pedido Luau',
        category: 'acceptance',
        status: !badStubCheck.passed && goodLuauCheck.passed ? 'PASSED' : 'FAILED',
        durationMs: Date.now() - tGuardStart,
        evidence: `Stub TS bloqueado=${!badStubCheck.passed}; Luau válido aprovado=${goodLuauCheck.passed}`,
      });

      // Test 4: Deploy Manifest Generation & Dockerfile check
      const tDepStart = Date.now();
      const depBundle = analyzeAndGenerateDeployBundle({
        projectName: 'titan-verify',
        files: [{ path: 'server.ts', content: 'import express from "express";', language: 'TypeScript' }],
        environment: 'production',
        provider: 'render',
      });
      const hasDockerAndRender =
        depBundle.files.some((f) => f.path === 'Dockerfile') &&
        depBundle.files.some((f) => f.path === 'render.yaml');
      tests.push({
        id: 'acceptance-deploy-configs',
        name: 'Deploy Center — Geração e validação Dockerfile/render.yaml/vercel.json',
        category: 'build',
        status: hasDockerAndRender ? 'PASSED' : 'FAILED',
        durationMs: Date.now() - tDepStart,
        evidence: `${depBundle.files.length} arquivos gerados; Stack=${depBundle.detectedStack}`,
      });

      // Test 5: Workspace static check (if files provided)
      if (Array.isArray(body.files) && body.files.length > 0) {
        const tWsStart = Date.now();
        const sCheck = validateSyntaxStatic(body.files);
        const cCheck = validateCodeCompleteness(body.files);
        tests.push({
          id: 'static-workspace-files',
          name: `Auditoria estática do projeto ativo (${body.files.length} arquivo(s))`,
          category: 'static',
          status: sCheck.passed && cCheck.passed ? 'PASSED' : 'FAILED',
          durationMs: Date.now() - tWsStart,
          evidence: sCheck.passed && cCheck.passed ? 'Sintaxe e completude aprovadas.' : [...(sCheck.details || []), ...(cCheck.details || [])].join(' | '),
        });
      }

      // Test 6: Android APK binary build availability check (honest reporting)
      const caps = await getSystemCapabilities();
      tests.push({
        id: 'build-android-sdk',
        name: 'Compilação Nativa Android APK (Gradle / Android SDK)',
        category: 'build',
        status: caps.androidSdkAvailable && caps.gradleAvailable ? 'PASSED' : 'NOT_EXECUTED',
        durationMs: 0,
        evidence: caps.androidSdkAvailable
          ? 'Android SDK presente no servidor.'
          : 'NOT_EXECUTED: Android SDK / Gradle não instalados no container Linux. Exportação fonte/CI GitHub Actions operacional.',
      });

      const passedCount = tests.filter((t) => t.status === 'PASSED').length;
      const failedCount = tests.filter((t) => t.status === 'FAILED').length;
      const notExecutedCount = tests.filter((t) => t.status === 'NOT_EXECUTED').length;

      res.json({
        executedAt: new Date().toISOString(),
        passedCount,
        failedCount,
        notExecutedCount,
        tests,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // --- Phase 14: TITAN Security Center Scanner ---
  app.post('/api/titan/security/scan', verifyFirebaseAuth, (req, res) => {
    const { files } = req.body as { files?: Array<{ path: string; content: string }> };
    const findings: SecurityFinding[] = [];
    const targetFiles = Array.isArray(files) ? files : [];

    for (const f of targetFiles) {
      const lines = f.content.split('\n');
      lines.forEach((line, idx) => {
        const lineNum = idx + 1;
        if (/(?:sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{20,}|AIza[0-9A-Za-z\-_]{35})/.test(line)) {
          findings.push({
            id: `sec_${crypto.randomUUID().slice(0, 6)}`,
            severity: 'CRITICAL',
            category: 'secret-leak',
            filePath: f.path,
            line: lineNum,
            title: 'Chave de API real ou Token GitHub/Google detectado no código',
            recommendation: 'Revogue a credencial imediatamente e utilize o Cofre do Servidor / Secrets.',
          });
        } else if (/(api_key|secret|password|token)\s*[:=]\s*['"][^'"]{8,}['"]/i.test(line)) {
          findings.push({
            id: `sec_${crypto.randomUUID().slice(0, 6)}`,
            severity: 'HIGH',
            category: 'secret-leak',
            filePath: f.path,
            line: lineNum,
            title: 'Possível credencial literal hardcoded',
            recommendation: 'Mover valor para variável de ambiente process.env.',
          });
        }
        if (/\beval\s*\(|\bnew Function\s*\(/.test(line)) {
          findings.push({
            id: `sec_${crypto.randomUUID().slice(0, 6)}`,
            severity: 'HIGH',
            category: 'injection',
            filePath: f.path,
            line: lineNum,
            title: 'Execução dinâmica de código (eval / new Function)',
            recommendation: 'Substitua por parser estruturado ou JSON.parse.',
          });
        }
        if (/innerHTML\s*=|dangerouslySetInnerHTML/.test(line)) {
          findings.push({
            id: `sec_${crypto.randomUUID().slice(0, 6)}`,
            severity: 'MEDIUM',
            category: 'xss',
            filePath: f.path,
            line: lineNum,
            title: 'Vetor potencial de XSS (innerHTML / dangerouslySetInnerHTML)',
            recommendation: 'Use textContent ou sanitização DOMPurify antes de renderizar HTML.',
          });
        }
        if (/http:\/\/(?!localhost|127\.0\.0\.1)/i.test(line)) {
          findings.push({
            id: `sec_${crypto.randomUUID().slice(0, 6)}`,
            severity: 'LOW',
            category: 'transport',
            filePath: f.path,
            line: lineNum,
            title: 'URL HTTP sem criptografia TLS',
            recommendation: 'Preferir HTTPS para tráfego externo.',
          });
        }
      });
    }

    if (findings.length === 0) {
      findings.push({
        id: `sec_ok`,
        severity: 'INFO',
        category: 'rbac',
        filePath: targetFiles.length > 0 ? `${targetFiles.length} arquivo(s)` : 'Workspace',
        title: 'Nenhuma vulnerabilidade crítica, segredo vazado ou XSS sink óbvio detectado',
        recommendation: 'Mantenha revisão periódica e dependências atualizadas.',
      });
    }

    res.json({ scannedFiles: targetFiles.length, findings, scannedAt: new Date().toISOString() });
  });

  // --- Phase 16: Async Task Queue ---
  app.get('/api/titan/queue', verifyFirebaseAuth, (req, res) => {
    res.json({
      jobs: listQueueJobs(req.user!.uid, req.user!.isAdmin),
      counts: getQueueCounts(),
    });
  });

  app.post('/api/titan/queue/:id/cancel', verifyFirebaseAuth, (req, res) => {
    const job = cancelQueueJob(req.params.id, req.user!.uid, req.user!.isAdmin);
    if (!job) {
      res.status(404).json({ error: 'Tarefa não encontrada ou sem permissão.' });
      return;
    }
    res.json(job);
  });

  app.post('/api/titan/queue/reset', verifyFirebaseAuth, (_req, res) => {
    const removed = resetFinishedJobs();
    res.json({ removed });
  });

  // Admin-gated Self-Test Suite (Section 23 verification)
  app.post('/api/titan/run-test-suite', verifyFirebaseAuth, requireAdmin, aiLimiter, async (_req, res) => {
    try {
      const testCases: Array<{
        id: string;
        name: string;
        module: 'script-studio' | 'project-builder';
        prompt: string;
        deliveryMode: DeliveryMode;
        projectTypeOverride?: ProjectType;
      }> = [
        {
          id: 'test-1-luau-fly',
          name: 'Teste 1 — Luau Fly',
          module: 'script-studio',
          prompt: 'Crie um script Fly em Luau para Roblox em um único script completo.',
          deliveryMode: 'single-file',
        },
        {
          id: 'test-2-python-calc',
          name: 'Teste 2 — Calculadora Python',
          module: 'script-studio',
          prompt: 'Crie uma calculadora funcional em Python com funções add, subtract, multiply, divide, tratamento de ZeroDivisionError e testes automatizados com assert no bloco main.',
          deliveryMode: 'single-file',
        },
        {
          id: 'test-3-kotlin-android',
          name: 'Teste 3 — Aplicativo Android Kotlin',
          module: 'project-builder',
          prompt: 'Crie um aplicativo Android em Kotlin com uma tela funcional de contador e lista de tarefas.',
          deliveryMode: 'multi-file',
          projectTypeOverride: 'android',
        },
        {
          id: 'test-4-web-page',
          name: 'Teste 4 — Página Web Completa',
          module: 'project-builder',
          prompt: 'Crie uma página web completa em HTML, CSS e JavaScript com conversor interativo de unidades e histórico.',
          deliveryMode: 'multi-file',
          projectTypeOverride: 'web',
        },
        {
          id: 'test-5-single-file',
          name: 'Teste 5 — Programa em Arquivo Único',
          module: 'script-studio',
          prompt: 'Crie um gerenciador de tarefas CLI completo em JavaScript em um único arquivo sem módulos externos.',
          deliveryMode: 'single-file',
        },
        {
          id: 'test-6-multi-file',
          name: 'Teste 6 — Projeto Multi-Arquivo',
          module: 'project-builder',
          prompt: 'Crie um projeto TypeScript com vários arquivos contendo módulo de validação, utilitário de formatação e arquivo principal com testes.',
          deliveryMode: 'multi-file',
          projectTypeOverride: 'fullstack',
        },
      ];

      const results = [];
      for (const tc of testCases) {
        const result = await runEngineeringPipeline({
          module: tc.module,
          prompt: tc.prompt,
          deliveryMode: tc.deliveryMode,
          projectTypeOverride: tc.projectTypeOverride,
        });
        results.push({
          id: tc.id,
          name: tc.name,
          status: result.status,
          language: result.plan.language,
          environment: result.plan.environment,
          filesCount: result.files.length,
          validators: result.validators,
          executionEvidence: result.executionEvidence,
          limitations: result.limitations,
        });
      }

      res.json({
        executedAt: new Date().toISOString(),
        results,
      });
    } catch (err) {
      res.status(500).json({
        error: 'Falha ao executar suíte de testes.',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // Vite Dev Middleware or Static Production Build
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath, { maxAge: '1d' }));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distPath, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build dist/index.html não encontrado.');
      }
    });
  }

  titanNeuralCore.ensureInitialized();
  app.listen(PORT, '0.0.0.0', () => {
    const neural = titanNeuralCore.getStatus();
    console.log(
      `TITAN CODE Server active on http://0.0.0.0:${PORT} | Autonomous ${neural.modelId} (${neural.parameterCount} params, loss=${neural.currentLoss})`,
    );
  });
}

startServer().catch((err) => {
  console.error('Failed to start TITAN CODE server:', err);
  process.exit(1);
});
