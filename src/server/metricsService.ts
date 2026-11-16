import type { NextFunction, Request, Response } from 'express';
import os from 'os';
import type { PerformanceMetricsSnapshot } from '../shared/titanTypes.ts';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const responseCache = new Map<string, CacheEntry<unknown>>();
let cacheHits = 0;
let cacheMisses = 0;
let totalRequests = 0;
let errorRequests = 0;
const latencySamples: number[] = [];
let lastBuildCheckMs: number | null = null;
let lastExecutionMs: number | null = null;

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!req.path.startsWith('/api/')) {
    next();
    return;
  }
  const started = Date.now();
  totalRequests += 1;
  res.on('finish', () => {
    const elapsed = Date.now() - started;
    latencySamples.push(elapsed);
    if (latencySamples.length > 200) {
      latencySamples.shift();
    }
    if (res.statusCode >= 400) {
      errorRequests += 1;
    }
  });
  next();
}

export function getCachedValue<T>(key: string): T | null {
  const entry = responseCache.get(key);
  if (!entry) {
    cacheMisses += 1;
    return null;
  }
  if (Date.now() > entry.expiresAt) {
    responseCache.delete(key);
    cacheMisses += 1;
    return null;
  }
  cacheHits += 1;
  return entry.value as T;
}

export function setCachedValue<T>(key: string, value: T, ttlMs: number): void {
  if (responseCache.size > 200) {
    const firstKey = responseCache.keys().next().value;
    if (firstKey) responseCache.delete(firstKey);
  }
  responseCache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

export function clearSafeCache(): { clearedEntries: number } {
  const count = responseCache.size;
  responseCache.clear();
  return { clearedEntries: count };
}

export function recordBuildCheckDuration(ms: number): void {
  lastBuildCheckMs = ms;
}

export function recordExecutionDuration(ms: number): void {
  lastExecutionMs = ms;
}

export function getPerformanceSnapshot(queueCounts: { queued: number; running: number }): PerformanceMetricsSnapshot {
  const mem = process.memoryUsage();
  const load = os.loadavg();
  const sorted = [...latencySamples].sort((a, b) => a - b);
  const avgLatencyMs =
    sorted.length > 0
      ? Math.round(sorted.reduce((acc, v) => acc + v, 0) / sorted.length)
      : 0;
  const p95Idx = sorted.length > 0 ? Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95)) : 0;
  const p95LatencyMs = sorted.length > 0 ? sorted[p95Idx] : 0;

  return {
    uptimeSec: Math.round(process.uptime()),
    memoryRssMb: Math.round((mem.rss / (1024 * 1024)) * 10) / 10,
    heapUsedMb: Math.round((mem.heapUsed / (1024 * 1024)) * 10) / 10,
    heapTotalMb: Math.round((mem.heapTotal / (1024 * 1024)) * 10) / 10,
    cpuLoad1m: Math.round((load[0] || 0) * 100) / 100,
    totalRequests,
    errorRequests,
    avgLatencyMs,
    p95LatencyMs,
    cacheEntries: responseCache.size,
    cacheHits,
    cacheMisses,
    queueQueued: queueCounts.queued,
    queueRunning: queueCounts.running,
    lastBuildCheckMs,
    lastExecutionMs,
    collectedAt: new Date().toISOString(),
  };
}
