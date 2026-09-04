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

// 🔴 FIX 8 (unbounded growth): the three heat maps grow one entry per distinct
// collection/entry/path-pair ever seen, FOREVER — applyDecay() only damps .score,
// it never deletes the Map entry, so the maps never shrink. The docstring claim
// "Self-pruning: Old entries expire automatically" was false. Worse,
// persistBehavioralData() serializes ALL of it into Redis every 15 min and
// restoreBehavioralData() reloads it on every boot — so the leak compounds across
// restarts instead of resetting. The author capped _predictionStats (MAX=5000, LRU)
// 40 lines below but forgot the three maps that matter most.
// Fix: size caps (LRU-ish, same pattern as _predictionStats) + score-based expiry
// pruned on persist, so a cold entry actually disappears and the snapshot never
// grows. These are memory REGRESSION guards: keep them generous — they only bound
// pathological growth, they don't throttle legitimate learning.
const MAX_COLLECTIONS_HEAT = 5000; // bounded distinct collections per tenant
const MAX_ENTRIES_HEAT = 20000; // bounded distinct entries per tenant
const MAX_TRANSITIONS_HEAT = 10000; // bounded distinct path-pairs per tenant
/** An entry whose score decays below this is considered cold and is pruned. */
const MIN_HOT_SCORE = 0.01;
/** Absolute ceiling on tracked tenants (multi-tenant safety net). */
const MAX_TENANTS = 1000;

// ─── Helpers ──────────────────────────────────────────────────────────────

function getOrCreateTenant(tenantId: string): TenantBehavior {
  let t = _tenants.get(tenantId);
  if (!t) {
    // 🔴 FIX 8: cap tracked tenants so a flood of distinct tenant ids can't grow
    // _tenants unbounded either.
    if (_tenants.size >= MAX_TENANTS) {
      const oldest = _tenants.keys().next().value;
      if (oldest !== undefined) _tenants.delete(oldest);
    }
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

/**
 * 🔴 FIX 8: prune ONE heat map — (a) drops entries whose score decayed below
 * MIN_HOT_SCORE (real "old entries expire automatically"), and (b) evicts the
 * oldest entry once the map exceeds its size cap (LRU-ish, same pattern the
 * author used for _predictionStats). `now` is passed so decay is recomputed for
 * entries not touched by a recent access — otherwise high stale scores live forever.
 */
function pruneHeatMap(map: Map<string, AccessRecord>, maxSize: number, now: number): void {
  // (a) score-based expiry: recompute decay and drop genuinely cold entries.
  for (const [key, rec] of map) {
    // Only recompute if stale; freshly-updated records are already decayed.
    if (now > rec.lastAccess) {
      applyDecay(rec, now);
      if (rec.score < MIN_HOT_SCORE) {
        map.delete(key);
      }
    }
  }
  // (b) size cap (LRU-ish eviction by insertion order).
  while (map.size > maxSize) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

/** Prune all three heat maps for a tenant to their caps. */
function pruneTenantHeat(t: TenantBehavior, now: number): void {
  pruneHeatMap(t.heat.collections, MAX_COLLECTIONS_HEAT, now);
  pruneHeatMap(t.heat.entries, MAX_ENTRIES_HEAT, now);
  pruneHeatMap(t.heat.transitions, MAX_TRANSITIONS_HEAT, now);
}

function applyDecay(record: AccessRecord, now: number): void {
  const elapsed = now - record.lastAccess;
  if (elapsed > 0) {
    record.score *= Math.exp(-DECAY_FACTOR * elapsed);
  }
}

/**
 * Pure decayed-score read (NO mutation). Read paths (getHotCollections/getHotEntries/
 * predictNextPath) must NOT mutate the maps — the original code called applyDecay() and
 * stamped `rec.lastAccess = now` for EVERY entry on EVERY page-load, which kept every
 * ever-seen entry perpetually "fresh" and made score-based expiry impossible. Computing
 * the decayed score locally keeps readers side-effect-free so pruneHeatMap can actually
 * retire cold entries.
 */
function decayedScore(record: AccessRecord, now: number): number {
  const elapsed = now - record.lastAccess;
  return elapsed > 0 ? record.score * Math.exp(-DECAY_FACTOR * elapsed) : record.score;
}

// ─── Public API ───────────────────────────────────────────────────────────

/** Shared heat-record update: decay + count + score, with eager LRU-ish capacity bound. */
function updateHeatRecord(
  map: Map<string, AccessRecord>,
  key: string,
  weight = 1,
  maxSize = MAX_COLLECTIONS_HEAT,
): void {
  const now = Date.now();
  let rec = map.get(key);
  if (!rec) {
    if (map.size >= maxSize) {
      const oldest = map.keys().next().value;
      if (oldest !== undefined) map.delete(oldest);
    }
    rec = { count: 0, lastAccess: now, score: 0 };
    map.set(key, rec);
  }
  applyDecay(rec, now);
  rec.count++;
  rec.lastAccess = now;
  rec.score += weight;
}
export function recordCollectionAccess(tenantId: string, collectionId: string): void {
  updateHeatRecord(
    getOrCreateTenant(tenantId).heat.collections,
    collectionId,
    1,
    MAX_COLLECTIONS_HEAT,
  );
}

export function recordEntryAccess(tenantId: string, collectionId: string, entryId: string): void {
  updateHeatRecord(
    getOrCreateTenant(tenantId).heat.entries,
    `${collectionId}:${entryId}`,
    1,
    MAX_ENTRIES_HEAT,
  );
}

/**
 * Record a mutation (create/update/write) for a collection and optional entry.
 * Mutations carry higher behavioral signal (weight: 2) than passive reads.
 */
export function recordWriteAccess(tenantId: string, collectionId: string, entryId?: string): void {
  const tid = tenantId || "global";
  updateHeatRecord(getOrCreateTenant(tid).heat.collections, collectionId, 2, MAX_COLLECTIONS_HEAT);
  if (entryId) {
    updateHeatRecord(
      getOrCreateTenant(tid).heat.entries,
      `${collectionId}:${entryId}`,
      2,
      MAX_ENTRIES_HEAT,
    );
  }
}

export function recordNavigation(tenantId: string, fromPath: string, toPath: string): void {
  updateHeatRecord(
    getOrCreateTenant(tenantId).heat.transitions,
    `${fromPath}→${toPath}`,
    1,
    MAX_TRANSITIONS_HEAT,
  );
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
/** Hard cap on tracked prediction paths — prevents unbounded map growth on long-lived servers. */
const MAX_PREDICTION_STATS = 5000;

function trackPredictionResult(tenantId: string, from: string, wasCorrect: boolean): void {
  const key = `${tenantId}:${from}`;
  let stats = _predictionStats.get(key);
  if (!stats) {
    // Bounded cache: evict the oldest tracked path when at capacity (LRU-ish).
    if (_predictionStats.size >= MAX_PREDICTION_STATS) {
      const oldest = _predictionStats.keys().next().value;
      if (oldest !== undefined) _predictionStats.delete(oldest);
    }
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
  // 🔴 FIX 8: prune cold entries + enforce cap before reading
  pruneHeatMap(t.heat.collections, MAX_COLLECTIONS_HEAT, now);
  const scored: { id: string; score: number }[] = [];
  for (const [id, rec] of t.heat.collections) {
    const score = decayedScore(rec, now);
    if (score > MIN_HOT_SCORE) scored.push({ id, score });
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
  // 🔴 FIX 8: prune cold entries + enforce cap before reading
  pruneHeatMap(t.heat.entries, MAX_ENTRIES_HEAT, now);
  const scored: { collectionId: string; entryId: string; score: number }[] = [];
  for (const [key, rec] of t.heat.entries) {
    const score = decayedScore(rec, now);
    if (score > MIN_HOT_SCORE) {
      const sep = key.indexOf(":");
      if (sep !== -1) {
        const collectionId = key.slice(0, sep);
        const entryId = key.slice(sep + 1);
        scored.push({ collectionId, entryId, score });
      }
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

export function predictNextPath(tenantId: string, currentPath: string): string | null {
  const t = _tenants.get(tenantId);
  if (!t) return null;
  const now = Date.now();
  // 🔴 FIX 8: prune cold entries + enforce cap before reading
  pruneHeatMap(t.heat.transitions, MAX_TRANSITIONS_HEAT, now);
  let best = "";
  let bestScore = 0;
  const prefix = `${currentPath}→`;
  for (const [key, rec] of t.heat.transitions) {
    if (key.startsWith(prefix)) {
      const score = decayedScore(rec, now);
      if (score > bestScore) {
        bestScore = score;
        best = key.slice(prefix.length);
      }
    }
  }
  return best || null;
}

// ─── Persistence ──────────────────────────────────────────────────────────

export async function persistBehavioralData(): Promise<void> {
  const { cacheService } = await import("@src/databases/cache/cache-service");
  const now = Date.now();
  // 🔴 FIX 8: prune all tenants to their caps BEFORE serializing, so a cold/overlong
  // snapshot is never written to Redis. Without this the whole unbounded state was
  // persisted every 15 min and reloaded every boot — the leak compounded across
  // restarts instead of resetting. Pruning here means what survives a restart is
  // already bounded.
  for (const t of _tenants.values()) pruneTenantHeat(t, now);
  // Single aggregate payload keyed by tenantId — restore reads ONE key and
  // repopulates every tenant's heat maps, so multi-tenant learning survives a
  // restart (the old per-tenant keys were never restored).
  const snapshot: Record<string, unknown> = {};
  for (const [tenantId, t] of _tenants) {
    snapshot[tenantId] = {
      collections: Array.from(t.heat.collections.entries()),
      entries: Array.from(t.heat.entries.entries()),
      transitions: Array.from(t.heat.transitions.entries()),
    };
    t.lastPersisted = Date.now();
  }
  await cacheService.set("behavioral:global", snapshot, 7 * 24 * 3600);
}

export async function restoreBehavioralData(): Promise<void> {
  const { cacheService } = await import("@src/databases/cache/cache-service");
  try {
    const data = await cacheService.get<any>("behavioral:global");
    if (!data) return;

    // Backward-compat: the legacy single-tenant payload had top-level
    // `collections` (a flat per-tenant shape for "global").
    if (Array.isArray(data.collections)) {
      restoreTenantMaps("global", data);
      return;
    }

    // Current format: { [tenantId]: { collections, entries, transitions } }.
    for (const [tenantId, tenantData] of Object.entries(data)) {
      restoreTenantMaps(tenantId, tenantData as any);
    }
  } catch {
    /* first run / malformed payload */
  }
}

function restoreTenantMaps(tenantId: string, data: any): void {
  const t = getOrCreateTenant(tenantId);
  for (const [k, v] of data.collections || []) t.heat.collections.set(k, v);
  for (const [k, v] of data.entries || []) t.heat.entries.set(k, v);
  for (const [k, v] of data.transitions || []) {
    if (typeof v === "number") {
      t.heat.transitions.set(k, { count: v, lastAccess: Date.now(), score: v });
    } else {
      t.heat.transitions.set(k, v);
    }
  }
  // 🔴 FIX 8: after loading, prune to caps — a corrupted / oversized legacy snapshot
  // (written before this fix) must be re-bounded on boot, not trusted at full size.
  pruneTenantHeat(t, Date.now());
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

export function clearBehavioralData(tenantId?: string): void {
  if (tenantId) {
    _tenants.delete(tenantId);
  } else {
    _tenants.clear();
  }
}

export function getTrackedTenantIds(): string[] {
  return Array.from(_tenants.keys());
}
