/**
 * @file src/services/intelligence/anomaly-detector.ts
 * @description Statistical anomaly detection for editorial behavior patterns.
 *
 * Tracks per-collection edit frequency and flags unusual patterns:
 * - Sudden spikes in edit activity (potential bulk content attack)
 * - Unusually large content changes (potential defacement)
 * - Off-hours editing patterns (potential unauthorized access)
 * - Entry deletion rate anomalies
 *
 * All detection is statistical (z-score based), not ML — fast, explainable,
 * and works on day one without training data.
 *
 * ### Privacy: Tenant-isolated, no PII, only aggregate statistics.
 */

// ─── Types ────────────────────────────────────────────────────────────────

export interface AnomalyResult {
  type: "spike" | "bulk-change" | "off-hours" | "deletion-rate";
  collectionId?: string;
  severity: "low" | "medium" | "high";
  zScore: number;
  currentValue: number;
  mean: number;
  stdDev: number;
  message: string;
  timestamp: number;
}

interface CollectionStats {
  editsPerHour: number[]; // Rolling window of hourly edit counts
  avgEditSize: number[]; // Rolling window of average bytes changed
  deletionsPerHour: number[]; // Rolling window of hourly deletions
  lastUpdated: number;
}

// ─── State ────────────────────────────────────────────────────────────────

const _stats = new Map<string, CollectionStats>();
const WINDOW_SIZE = 168; // 7 days of hourly data
const ANOMALY_THRESHOLD = 2.5; // z-score threshold

// ─── Statistical Helpers ──────────────────────────────────────────────────

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[], avg: number): number {
  if (values.length < 2) return 1;
  const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function zScore(value: number, avg: number, sd: number): number {
  if (sd === 0) return 0;
  return (value - avg) / sd;
}

function getOrCreateStats(collectionId: string): CollectionStats {
  let stats = _stats.get(collectionId);
  if (!stats) {
    stats = {
      editsPerHour: [],
      avgEditSize: [],
      deletionsPerHour: [],
      lastUpdated: Date.now(),
    };
    _stats.set(collectionId, stats);
  }
  return stats;
}

function pushToWindow(arr: number[], value: number): void {
  arr.push(value);
  if (arr.length > WINDOW_SIZE) arr.shift();
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Record an edit event for anomaly tracking.
 * Called after every content mutation (POST/PATCH/PUT).
 */
export function recordEdit(collectionId: string, bytesChanged: number): void {
  const stats = getOrCreateStats(collectionId);
  pushToWindow(stats.editsPerHour, 1);
  pushToWindow(stats.avgEditSize, bytesChanged);
  stats.lastUpdated = Date.now();
}

/**
 * Record a deletion event for anomaly tracking.
 */
export function recordDeletion(collectionId: string): void {
  const stats = getOrCreateStats(collectionId);
  pushToWindow(stats.deletionsPerHour, 1);
  stats.lastUpdated = Date.now();
}

/**
 * Check for anomalies across all tracked collections.
 * Returns any anomalies that exceed the z-score threshold.
 */
export function detectAnomalies(): AnomalyResult[] {
  const anomalies: AnomalyResult[] = [];
  const now = Date.now();

  for (const [collectionId, stats] of _stats) {
    // Skip collections with insufficient data
    if (stats.editsPerHour.length < 10) continue;

    // 1. Edit spike detection
    const recentEdits = stats.editsPerHour.slice(-1)[0] || 0;
    const editAvg = mean(stats.editsPerHour);
    const editSd = stdDev(stats.editsPerHour, editAvg);
    const editZ = zScore(recentEdits, editAvg, editSd);

    if (editZ > ANOMALY_THRESHOLD) {
      anomalies.push({
        type: "spike",
        collectionId,
        severity: editZ > 4 ? "high" : editZ > 3 ? "medium" : "low",
        zScore: Math.round(editZ * 100) / 100,
        currentValue: recentEdits,
        mean: Math.round(editAvg),
        stdDev: Math.round(editSd),
        message: `Unusual edit spike in "${collectionId}": ${recentEdits} edits/hour (avg: ${Math.round(editAvg)}, z=${editZ.toFixed(1)})`,
        timestamp: now,
      });
    }

    // 2. Bulk change detection (unusually large edits)
    const recentSize = stats.avgEditSize.slice(-1)[0] || 0;
    const sizeAvg = mean(stats.avgEditSize);
    const sizeSd = stdDev(stats.avgEditSize, sizeAvg);
    const sizeZ = zScore(recentSize, sizeAvg, sizeSd);

    if (sizeZ > ANOMALY_THRESHOLD && recentSize > 10000) {
      anomalies.push({
        type: "bulk-change",
        collectionId,
        severity: sizeZ > 4 ? "high" : "medium",
        zScore: Math.round(sizeZ * 100) / 100,
        currentValue: recentSize,
        mean: Math.round(sizeAvg),
        stdDev: Math.round(sizeSd),
        message: `Unusually large edit in "${collectionId}": ${recentSize} bytes (avg: ${Math.round(sizeAvg)})`,
        timestamp: now,
      });
    }

    // 3. Deletion rate anomaly
    const recentDeletes = stats.deletionsPerHour.slice(-1)[0] || 0;
    const delAvg = mean(stats.deletionsPerHour);
    const delSd = stdDev(stats.deletionsPerHour, delAvg);
    const delZ = zScore(recentDeletes, delAvg, delSd);

    if (delZ > ANOMALY_THRESHOLD && recentDeletes > 3) {
      anomalies.push({
        type: "deletion-rate",
        collectionId,
        severity: delZ > 4 ? "high" : "medium",
        zScore: Math.round(delZ * 100) / 100,
        currentValue: recentDeletes,
        mean: Math.round(delAvg),
        stdDev: Math.round(delSd),
        message: `Elevated deletion rate in "${collectionId}": ${recentDeletes}/hour (avg: ${Math.round(delAvg)})`,
        timestamp: now,
      });
    }
  }

  // 4. Off-hours detection
  const currentHour = new Date().getHours();
  const isOffHours = currentHour < 6 || currentHour > 22;
  if (isOffHours) {
    const activeCollections = [..._stats.entries()]
      .filter(([, s]) => (s.editsPerHour.slice(-1)[0] || 0) > 0)
      .map(([id]) => id);

    if (activeCollections.length > 3) {
      anomalies.push({
        type: "off-hours",
        severity: activeCollections.length > 10 ? "high" : "medium",
        zScore: 0,
        currentValue: activeCollections.length,
        mean: 0,
        stdDev: 0,
        message: `Unusual off-hours activity: ${activeCollections.length} collections being edited at ${currentHour}:00`,
        timestamp: now,
      });
    }
  }

  return anomalies;
}

/**
 * Get anomaly statistics for dashboard display.
 */
export function getAnomalyStats(): {
  trackedCollections: number;
  recentAnomalies: number;
  lastCheck: number;
} {
  const anomalies = detectAnomalies();
  return {
    trackedCollections: _stats.size,
    recentAnomalies: anomalies.length,
    lastCheck: Date.now(),
  };
}

/**
 * Periodic cleanup of old statistics.
 */
export function pruneAnomalyStats(): void {
  const cutoff = Date.now() - 14 * 24 * 3600 * 1000; // 14 days
  for (const [key, stats] of _stats) {
    if (stats.lastUpdated < cutoff) {
      _stats.delete(key);
    }
  }
}
