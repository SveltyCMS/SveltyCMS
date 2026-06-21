/**
 * @file src/services/intelligence/behavioral-learner.ts
 * @description Lightweight server-side behavioral learning engine.
 * Tracks access patterns per-tenant, computes frequency scores, and drives
 * adaptive cache warming, smart prefetch hints, and dashboard reordering.
 *
 * ### Design Principles:
 * - **Zero client overhead**: All tracking is server-side via hooks.
 * - **Privacy-first**: Tenant-scoped, no PII, data never leaves the server.
 * - **Decay-weighted**: Recent accesses count more than old ones (24h half-life).
 * - **Sub-millisecond**: In-memory with periodic persistence, no per-request I/O.
 * - **Self-pruning**: Old entries expire automatically.
 */

import { logger } from "@utils/logger";

// ─── Types ────────────────────────────────────────────────────────────────

interface AccessRecord {
  count: number;
  lastAccess: number;
  score: number;
}

interface CollectionHeat {
  collections: Map<string, AccessRecord>;
  entries: Map<string, AccessRecord>;
  transitions: Map<string, AccessRecord>;
}

interface TenantBehavior {
  heat: CollectionHeat;
  lastPersisted: number;
}

// ─── State ────────────────────────────────────────────────────────────────

const _tenants = new Map<string, TenantBehavior>();
const HALF_LIFE_MS = 24 * 60 * 60 * 1000;
const DECAY_FACTOR = Math.LN2 / HALF_LIFE_MS;
const PERSIST_INTERVAL_MS = 15 * 60 * 1000;
let _persistTimer: ReturnType<typeof setInterval> | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────

function getOrCreateTenant(tenantId: string): TenantBehavior {
  let t = _tenants.get(tenantId);
  if (!t) {
    t = {
      heat: {
        collections: new Map(),
        entries: new Map(),
        transitions: new Map(),
      },
      lastPersisted: Date.now(),
    };
    _tenants.set(tenantId, t);
  }
  return t;
}

function applyDecay(record: AccessRecord, now: number): void {
  const elapsed = now - record.lastAccess;
  if (elapsed > 0) {
    record.score *= Math.exp(-DECAY_FACTOR * elapsed);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────

export function recordCollectionAccess(tenantId: string, collectionId: string): void {
  const t = getOrCreateTenant(tenantId);
  const now = Date.now();
  let rec = t.heat.collections.get(collectionId);
  if (!rec) {
    rec = { count: 0, lastAccess: now, score: 0 };
    t.heat.collections.set(collectionId, rec);
  }
  applyDecay(rec, now);
  rec.count++;
  rec.lastAccess = now;
  rec.score += 1;
}

export function recordEntryAccess(tenantId: string, collectionId: string, entryId: string): void {
  const t = getOrCreateTenant(tenantId);
  const key = `${collectionId}:${entryId}`;
  const now = Date.now();
  let rec = t.heat.entries.get(key);
  if (!rec) {
    rec = { count: 0, lastAccess: now, score: 0 };
    t.heat.entries.set(key, rec);
  }
  applyDecay(rec, now);
  rec.count++;
  rec.lastAccess = now;
  rec.score += 1;
}

export function recordNavigation(tenantId: string, fromPath: string, toPath: string): void {
  const t = getOrCreateTenant(tenantId);
  const key = `${fromPath}→${toPath}`;
  const now = Date.now();
  let rec = t.heat.transitions.get(key);
  if (!rec) {
    rec = { count: 0, lastAccess: now, score: 0 };
    t.heat.transitions.set(key, rec);
  }
  applyDecay(rec, now);
  rec.count++;
  rec.lastAccess = now;
  rec.score += 1;
}

/**
 * Positive Reinforcement (Operant Conditioning):
 * Strengthens a navigation transition score when the system's prediction is successfully followed.
 */
export function reinforceTransition(tenantId: string, fromPath: string, toPath: string): void {
  const t = getOrCreateTenant(tenantId);
  const key = `${fromPath}→${toPath}`;
  const now = Date.now();
  let rec = t.heat.transitions.get(key);
  if (rec) {
    applyDecay(rec, now);
    rec.count++;
    rec.score += 2.0; // Positive reinforcement reward
    trackPredictionResult(tenantId, fromPath, true);
    rec.lastAccess = now;
  }
}

/**
 * Punishment (Operant Conditioning):
 * Reduces transition score when the user immediately bounces back (e.g. within 2 seconds).
 */
export function penalizeTransition(tenantId: string, fromPath: string, toPath: string): void {
  const t = getOrCreateTenant(tenantId);
  const key = `${fromPath}→${toPath}`;
  const now = Date.now();
  let rec = t.heat.transitions.get(key);
  if (rec) {
    applyDecay(rec, now);
    rec.score = Math.max(0, rec.score - 1.5); // Punishment penalty
    rec.lastAccess = now;
  }
}

/**
 * Extinction (Operant Conditioning):
 * Accelerates the decay of alternative (ignored) predictions when a different path is taken.
 */
export function applyExtinction(
  tenantId: string,
  currentPath: string,
  actualNextPath: string,
): void {
  const t = getOrCreateTenant(tenantId);
  const prefix = `${currentPath}→`;
  const now = Date.now();
  for (const [key, rec] of t.heat.transitions) {
    if (key.startsWith(prefix) && key !== `${prefix}${actualNextPath}`) {
      applyDecay(rec, now);
      rec.score *= 0.8; // Extinction decay factor
      trackPredictionResult(tenantId, currentPath, false);
      rec.lastAccess = now;
    }
  }
}

// ─── Confidence & Adaptive Prediction ────────────────────────────────────

interface PredictionStats {
  correct: number;
  total: number;
  lastCorrect: number;
}

const _predictionStats = new Map<string, PredictionStats>();
const MIN_CONFIDENCE_THRESHOLD = 0.3;

function trackPredictionResult(tenantId: string, from: string, wasCorrect: boolean): void {
  const key = `${tenantId}:${from}`;
  let stats = _predictionStats.get(key);
  if (!stats) {
    stats = { correct: 0, total: 0, lastCorrect: 0 };
    _predictionStats.set(key, stats);
  }
  stats.total++;
  if (wasCorrect) {
    stats.correct++;
    stats.lastCorrect = Date.now();
  }
  if (stats.total > 1000 && Date.now() - stats.lastCorrect > 7 * 24 * 3600 * 1000)
    _predictionStats.delete(key);
}

export function getPredictionConfidence(tenantId: string, fromPath: string): number {
  const key = `${tenantId}:${fromPath}`;
  const stats = _predictionStats.get(key);
  if (!stats || stats.total < 5) return 0;
  return stats.correct / stats.total;
}

export function predictNextPathAdaptive(tenantId: string, currentPath: string): string | null {
  const confidence = getPredictionConfidence(tenantId, currentPath);
  if (confidence < MIN_CONFIDENCE_THRESHOLD) return null;
  return predictNextPath(tenantId, currentPath);
}

export function getHotCollections(tenantId: string, limit = 10): { id: string; score: number }[] {
  const t = _tenants.get(tenantId);
  if (!t) return [];
  const now = Date.now();
  const scored: { id: string; score: number }[] = [];
  for (const [id, rec] of t.heat.collections) {
    applyDecay(rec, now);
    rec.lastAccess = now;
    if (rec.score > 0.01) scored.push({ id, score: rec.score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

export function getHotEntries(
  tenantId: string,
  limit = 20,
): { collectionId: string; entryId: string; score: number }[] {
  const t = _tenants.get(tenantId);
  if (!t) return [];
  const now = Date.now();
  const scored: { collectionId: string; entryId: string; score: number }[] = [];
  for (const [key, rec] of t.heat.entries) {
    applyDecay(rec, now);
    rec.lastAccess = now;
    if (rec.score > 0.01) {
      const [collectionId, entryId] = key.split(":");
      scored.push({ collectionId, entryId, score: rec.score });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

export function predictNextPath(tenantId: string, currentPath: string): string | null {
  const t = _tenants.get(tenantId);
  if (!t) return null;
  let best = "";
  let bestScore = 0;
  const prefix = `${currentPath}→`;
  const now = Date.now();
  for (const [key, rec] of t.heat.transitions) {
    if (key.startsWith(prefix)) {
      applyDecay(rec, now);
      rec.lastAccess = now;
      if (rec.score > bestScore) {
        bestScore = rec.score;
        best = key.slice(prefix.length);
      }
    }
  }
  return best || null;
}

// ─── Persistence ──────────────────────────────────────────────────────────

export async function persistBehavioralData(): Promise<void> {
  const { cacheService } = await import("@src/databases/cache/cache-service");
  for (const [tenantId, t] of _tenants) {
    const data = {
      collections: Array.from(t.heat.collections.entries()),
      entries: Array.from(t.heat.entries.entries()),
      transitions: Array.from(t.heat.transitions.entries()),
    };
    await cacheService.set(`behavioral:${tenantId}`, data, 7 * 24 * 3600);
    t.lastPersisted = Date.now();
  }
}

export async function restoreBehavioralData(): Promise<void> {
  const { cacheService } = await import("@src/databases/cache/cache-service");
  try {
    const data = await cacheService.get<any>("behavioral:global");
    if (data) {
      const t = getOrCreateTenant("global");
      for (const [k, v] of data.collections || []) t.heat.collections.set(k, v);
      for (const [k, v] of data.entries || []) t.heat.entries.set(k, v);
      for (const [k, v] of data.transitions || []) {
        if (typeof v === "number") {
          t.heat.transitions.set(k, {
            count: v,
            lastAccess: Date.now(),
            score: v,
          });
        } else {
          t.heat.transitions.set(k, v);
        }
      }
    }
  } catch {
    /* first run */
  }
}

export function startBehavioralEngine(): void {
  if (_persistTimer) return;
  restoreBehavioralData().catch(() => {});
  _persistTimer = setInterval(() => {
    persistBehavioralData().catch(() => {});
  }, PERSIST_INTERVAL_MS);
  logger.info("[Behavioral] Learning engine started");
}

export function stopBehavioralEngine(): void {
  if (_persistTimer) {
    clearInterval(_persistTimer);
    _persistTimer = null;
  }
  persistBehavioralData().catch(() => {});
}
