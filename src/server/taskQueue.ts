import crypto from 'crypto';
import type { QueueJob, QueuePriority } from '../shared/titanTypes.ts';

interface InternalQueueJob {
  meta: QueueJob;
  runner: (updateProgress: (pct: number) => void, signal: AbortSignal) => Promise<unknown>;
  controller: AbortController;
}

const MAX_CONCURRENCY = 2;
const PRIORITY_RANK: Record<QueuePriority, number> = {
  HIGH: 0,
  NORMAL: 1,
  LOW: 2,
};

const jobs = new Map<string, InternalQueueJob>();
let activeCount = 0;

function scheduleNext(): void {
  if (activeCount >= MAX_CONCURRENCY) return;

  const queued = [...jobs.values()]
    .filter((j) => j.meta.status === 'QUEUED')
    .sort((a, b) => {
      const pr = PRIORITY_RANK[a.meta.priority] - PRIORITY_RANK[b.meta.priority];
      if (pr !== 0) return pr;
      return a.meta.createdAt.localeCompare(b.meta.createdAt);
    });

  const next = queued[0];
  if (!next) return;

  activeCount += 1;
  next.meta.status = 'RUNNING';
  next.meta.startedAt = new Date().toISOString();
  next.meta.progress = 10;

  const timeoutHandle = setTimeout(() => {
    next.controller.abort(new Error(`Timeout excedido (${next.meta.timeoutMs}ms)`));
  }, next.meta.timeoutMs);

  const runAttempt = async (): Promise<void> => {
    try {
      const result = await next.runner(
        (pct) => {
          if (next.meta.status === 'RUNNING') {
            next.meta.progress = Math.max(0, Math.min(99, Math.round(pct)));
          }
        },
        next.controller.signal,
      );
      clearTimeout(timeoutHandle);
      if (next.meta.status === 'CANCELLED') return;
      next.meta.status = 'COMPLETED';
      next.meta.progress = 100;
      next.meta.result = result;
      next.meta.finishedAt = new Date().toISOString();
    } catch (err) {
      clearTimeout(timeoutHandle);
      if (next.meta.status === 'CANCELLED') return;
      const errMsg = err instanceof Error ? err.message : String(err);
      if (next.meta.retries < next.meta.maxRetries && !next.controller.signal.aborted) {
        next.meta.retries += 1;
        next.meta.progress = 5;
        await runAttempt();
        return;
      }
      next.meta.status = 'FAILED';
      next.meta.error = errMsg;
      next.meta.finishedAt = new Date().toISOString();
    }
  };

  void runAttempt().finally(() => {
    activeCount = Math.max(0, activeCount - 1);
    scheduleNext();
  });

  if (activeCount < MAX_CONCURRENCY) {
    scheduleNext();
  }
}

export function enqueueJob(params: {
  ownerId: string;
  type: QueueJob['type'];
  title: string;
  priority?: QueuePriority;
  maxRetries?: number;
  timeoutMs?: number;
  runner: (updateProgress: (pct: number) => void, signal: AbortSignal) => Promise<unknown>;
}): QueueJob {
  const id = `job_${crypto.randomUUID().slice(0, 10)}`;
  const meta: QueueJob = {
    id,
    ownerId: params.ownerId,
    type: params.type,
    title: params.title,
    priority: params.priority || 'NORMAL',
    status: 'QUEUED',
    progress: 0,
    retries: 0,
    maxRetries: params.maxRetries ?? 1,
    timeoutMs: params.timeoutMs ?? 60_000,
    createdAt: new Date().toISOString(),
  };

  jobs.set(id, {
    meta,
    runner: params.runner,
    controller: new AbortController(),
  });

  // Trim old finished jobs beyond 100
  if (jobs.size > 100) {
    for (const [k, v] of jobs.entries()) {
      if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(v.meta.status)) {
        jobs.delete(k);
        if (jobs.size <= 80) break;
      }
    }
  }

  scheduleNext();
  return meta;
}

export function listQueueJobs(ownerId: string, isAdmin: boolean): QueueJob[] {
  return [...jobs.values()]
    .filter((j) => isAdmin || j.meta.ownerId === ownerId)
    .map((j) => ({ ...j.meta }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getQueueJob(id: string, ownerId: string, isAdmin: boolean): QueueJob | null {
  const found = jobs.get(id);
  if (!found) return null;
  if (!isAdmin && found.meta.ownerId !== ownerId) return null;
  return { ...found.meta };
}

export function cancelQueueJob(id: string, ownerId: string, isAdmin: boolean): QueueJob | null {
  const found = jobs.get(id);
  if (!found) return null;
  if (!isAdmin && found.meta.ownerId !== ownerId) return null;
  if (found.meta.status === 'QUEUED' || found.meta.status === 'RUNNING') {
    found.meta.status = 'CANCELLED';
    found.meta.finishedAt = new Date().toISOString();
    found.controller.abort(new Error('Cancelado pelo usuário.'));
  }
  return { ...found.meta };
}

export function getQueueCounts(): { queued: number; running: number } {
  let queued = 0;
  let running = 0;
  for (const j of jobs.values()) {
    if (j.meta.status === 'QUEUED') queued += 1;
    else if (j.meta.status === 'RUNNING') running += 1;
  }
  return { queued, running };
}

export function resetFinishedJobs(): number {
  let removed = 0;
  for (const [k, v] of jobs.entries()) {
    if (v.meta.status !== 'RUNNING' && v.meta.status !== 'QUEUED') {
      jobs.delete(k);
      removed += 1;
    }
  }
  return removed;
}
