import crypto from 'crypto';
import type {
  AiProviderConfigSummary,
  AiRequestHistoryEntry,
  IntegrationStatus,
} from '../shared/titanTypes.ts';
import { titanNeuralCore } from './titanNeural/datasetAndTrainer.ts';

const requestHistory: AiRequestHistoryEntry[] = [];

export function recordNeuralRequestHistory(entry: Omit<AiRequestHistoryEntry, 'id' | 'timestamp'>): void {
  requestHistory.unshift({
    ...entry,
    id: `aireq_${crypto.randomUUID().slice(0, 8)}`,
    timestamp: new Date().toISOString(),
  });
  if (requestHistory.length > 60) {
    requestHistory.pop();
  }
}

export function listProviders(): AiProviderConfigSummary[] {
  const status = titanNeuralCore.getStatus();
  return [
    {
      id: 'titan-neural-core',
      kind: 'custom',
      name: 'TITAN Neural Core (Motor Próprio Autônomo)',
      model: `${status.modelId} (${status.parameterCount.toLocaleString('en-US')} params)`,
      baseUrl: 'local://titan-neural-core',
      enabled: true,
      priority: 1,
      hasCredential: true,
      status: 'CONNECTED',
      lastCheckedAt: status.lastTrainedAt,
      requestCount: requestHistory.length,
      estimatedTokens: requestHistory.reduce((acc, r) => acc + r.estimatedTokens, 0),
    },
  ];
}

export function getProviderHistory(): AiRequestHistoryEntry[] {
  return [...requestHistory];
}

export function configureProvider(params: {
  id: string;
  model?: string;
  baseUrl?: string;
  enabled?: boolean;
  priority?: number;
  apiKey?: string;
}): AiProviderConfigSummary {
  if (params.id !== 'titan-neural-core') {
    throw new Error('Dependências de IAs externas foram removidas. Apenas o motor próprio TITAN Neural Core é utilizado no fluxo principal.');
  }
  return listProviders()[0];
}

export async function testProviderConnection(id: string): Promise<{
  ok: boolean;
  status: IntegrationStatus;
  latencyMs: number;
  detail: string;
}> {
  if (id !== 'titan-neural-core') {
    return {
      ok: false,
      status: 'DISCONNECTED',
      latencyMs: 0,
      detail: 'Provedores externos removidos da arquitetura central TITAN.',
    };
  }
  const started = Date.now();
  const status = titanNeuralCore.getStatus();
  return {
    ok: true,
    status: 'CONNECTED',
    latencyMs: Date.now() - started,
    detail: `TITAN Neural Core operacional offline/local (${status.parameterCount} parâmetros, Loss=${status.currentLoss}, Perplexity=${status.perplexity}).`,
  };
}
