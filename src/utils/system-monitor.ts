/**
 * @file src/utils/system-monitor.ts
 * @description Hardware-aware system monitor for adaptive rate limiting and health telemetry.
 *
 * Uses node-os-utils for CPU/memory sensing and perf_hooks for event loop lag detection.
 * Drives the hardware-aware rate limiting documented in state-management.mdx —
 * previously documented but not implemented.
 *
 * ### Features:
 * - CPU usage, memory pressure, load average, event loop lag (real-time)
 * - Rolling historical buffer (60 samples, 5s intervals) for dashboard sparklines
 * - getPressureMultiplier() — adaptive 0.8x–2.0x for rate limit cost adjustment
 * - shouldRejectMutations() — defensive gating when heap exceeds 90%
 * - Singleton, auto-started on first access, zero per-request allocation
 * - Node-os-utils backed (already a dependency — was previously unused)
 */

import { logger } from "@utils/logger";

// ─── Types ────────────────────────────────────────────────────────────────

export interface CpuSnapshot {
  usage: number; // 0–100
  cores: number;
  model: string;
  loadAvg: number; // 1-min load average
}

export interface MemSnapshot {
  usedPercent: number; // 0–100
  totalMb: number;
  usedMb: number;
  freeMb: number;
}

export interface SystemHealthSnapshot {
  timestamp: number;
  cpu: number; // overall CPU usage %
  memory: number; // memory usage %
  loadAvg: number; // 1-min load avg
  eventLoopLagMs: number; // p95 event loop lag in ms
  heapUsedPercent: number; // V8 heap usage %
  pressure: "idle" | "normal" | "elevated" | "critical";
}

export interface HistoricalPoint {
  timestamp: string; // ISO string
  usage: number; // CPU %
}

// ─── Constants ─────────────────────────────────────────────────────────────

const HISTORY_SIZE = 60; // 60 samples × 5s = 5 minutes of history
const SAMPLE_INTERVAL_MS = 5000;

const PRESSURE_THRESHOLDS = {
  idleCpu: 30, // CPU < 30% → idle
  idleMem: 50, // Mem < 50% → idle
  elevatedCpu: 70, // CPU > 70% → elevated
  elevatedMem: 80, // Mem > 80% → elevated
  criticalCpu: 90, // CPU > 90% → critical
  criticalMem: 92, // Mem > 92% → critical
  criticalLag: 80, // Event loop lag > 80ms → critical
  rejectHeap: 90, // Heap > 90% → reject mutations
};

// ─── State ────────────────────────────────────────────────────────────────

let _started = false;
let _interval: ReturnType<typeof setInterval> | null = null;
let _lastSnapshot: SystemHealthSnapshot | null = null;
const _history: HistoricalPoint[] = [];
let _lagHistogram: any = null; // perf_hooks.EventLoopDelayHistogram
let _lagEnabled = false;

// ─── Helpers ──────────────────────────────────────────────────────────────

async function readCpu(): Promise<{
  usage: number;
  cores: number;
  model: string;
  loadAvg: number;
}> {
  try {
    const osu = await import("node-os-utils");
    const cpuUsage = await osu.cpu.usage(100); // sample over 100ms
    const loadAvg = osu.loadavgTime?.(1) ?? osu.os.loadavgTime?.(1) ?? 0; // 1-min
    const cpuInfo = osu.cpu as any;
    const cores = cpuInfo.count?.() ?? 1;
    const model = cpuInfo.model?.() ?? "Unknown";
    return { usage: Math.round(cpuUsage), cores, model, loadAvg };
  } catch {
    return { usage: 0, cores: 1, model: "Unknown", loadAvg: 0 };
  }
}

async function readMem(): Promise<MemSnapshot> {
  try {
    const osu = await import("node-os-utils");
    const memInfo = await osu.mem.info();
    return {
      usedPercent: Math.round(memInfo.usedMemPercentage ?? 0),
      totalMb: Math.round(memInfo.totalMemMb ?? 0),
      usedMb: Math.round(memInfo.usedMemMb ?? 0),
      freeMb: Math.round((memInfo.totalMemMb ?? 0) - (memInfo.usedMemMb ?? 0)),
    };
  } catch {
    return { usedPercent: 0, totalMb: 0, usedMb: 0, freeMb: 0 };
  }
}

function getHeapUsedPercent(): number {
  const mem = process.memoryUsage();
  const limit = mem.heapTotal || 1;
  return Math.round((mem.heapUsed / limit) * 100);
}

function getEventLoopLagMs(): number {
  if (!_lagEnabled || !_lagHistogram) return 0;
  try {
    // p95 from histogram
    return Math.round(((_lagHistogram.percentile(95) ?? 0) / 1e6) * 100) / 100;
  } catch {
    return 0;
  }
}

function determinePressure(
  cpu: number,
  mem: number,
  lag: number,
): "idle" | "normal" | "elevated" | "critical" {
  if (
    cpu > PRESSURE_THRESHOLDS.criticalCpu ||
    mem > PRESSURE_THRESHOLDS.criticalMem ||
    lag > PRESSURE_THRESHOLDS.criticalLag
  ) {
    return "critical";
  }
  if (cpu > PRESSURE_THRESHOLDS.elevatedCpu || mem > PRESSURE_THRESHOLDS.elevatedMem) {
    return "elevated";
  }
  if (cpu < PRESSURE_THRESHOLDS.idleCpu && mem < PRESSURE_THRESHOLDS.idleMem) {
    return "idle";
  }
  return "normal";
}

async function collectSnapshot(): Promise<SystemHealthSnapshot> {
  const [cpuData, memData] = await Promise.all([readCpu(), readMem()]);
  const snapshot: SystemHealthSnapshot = {
    timestamp: Date.now(),
    cpu: cpuData.usage,
    memory: memData.usedPercent,
    loadAvg: cpuData.loadAvg,
    eventLoopLagMs: getEventLoopLagMs(),
    heapUsedPercent: getHeapUsedPercent(),
    pressure: determinePressure(cpuData.usage, memData.usedPercent, getEventLoopLagMs()),
  };

  // Store CPU core info as extras (not part of the snapshot for history)
  (snapshot as any)._cpuCores = cpuData.cores;
  (snapshot as any)._cpuModel = cpuData.model;

  _lastSnapshot = snapshot;

  // Add to rolling history buffer
  _history.push({
    timestamp: new Date(snapshot.timestamp).toISOString(),
    usage: snapshot.cpu,
  });
  if (_history.length > HISTORY_SIZE) {
    _history.shift();
  }

  return snapshot;
}

// ─── Public API ───────────────────────────────────────────────────────────

/** Start background monitoring. Called automatically on first access. */
export function startSystemMonitor(): void {
  if (_started) return;

  // Enable event loop lag monitoring if available (Node 12+)
  try {
    const { monitorEventLoopDelay } = require("node:perf_hooks");
    _lagHistogram = monitorEventLoopDelay({ resolution: 20 });
    _lagHistogram.enable();
    _lagEnabled = true;
  } catch {
    _lagEnabled = false;
  }

  // Collect initial snapshot immediately
  collectSnapshot().catch(() => {});

  // Collect every 5 seconds
  _interval = setInterval(() => {
    collectSnapshot().catch(() => {});
  }, SAMPLE_INTERVAL_MS);

  _started = true;
  logger.info("[SystemMonitor] Hardware-aware monitoring started");
}

/** Stop background monitoring. Called on graceful shutdown. */
export function stopSystemMonitor(): void {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
  }
  if (_lagHistogram) {
    try {
      _lagHistogram.disable();
    } catch {}
    _lagHistogram = null;
  }
  _started = false;
}

/** Get the most recent system health snapshot (< 1ms, no I/O). */
export function getLatestSnapshot(): SystemHealthSnapshot | null {
  if (!_started) startSystemMonitor();
  return _lastSnapshot;
}

/** Get historical CPU data for dashboard sparklines. */
export function getCpuHistory(): HistoricalPoint[] {
  if (!_started) startSystemMonitor();
  return [..._history];
}

/** Get CPU info (cores, model) for dashboard display. */
export function getCpuInfo(): { cores: number; model: string } {
  const snap = _lastSnapshot as any;
  return {
    cores: snap?._cpuCores ?? 1,
    model: snap?._cpuModel ?? "Unknown",
  };
}

/**
 * Adaptive rate limit multiplier based on real-time system pressure.
 *
 * Returns a multiplier that the rate limiter applies to request costs:
 * - idle: 0.8x (boost capacity — system has headroom)
 * - normal: 1.0x (baseline)
 * - elevated: 1.5x (gradual throttling)
 * - critical: 2.0x (aggressive throttling)
 *
 * < 0.001ms — reads cached snapshot, no I/O.
 */
export function getPressureMultiplier(): number {
  if (!_started || !_lastSnapshot) return 1.0;

  switch (_lastSnapshot.pressure) {
    case "idle":
      return 0.8;
    case "elevated":
      return 1.5;
    case "critical":
      return 2.0;
    default:
      return 1.0;
  }
}

/**
 * Should the system reject mutating requests (POST/PATCH/PUT/DELETE)?
 * Returns true when heap usage exceeds the rejection threshold (90%).
 */
export function shouldRejectMutations(): boolean {
  if (!_started || !_lastSnapshot) return false;
  return _lastSnapshot.heapUsedPercent > PRESSURE_THRESHOLDS.rejectHeap;
}

/**
 * Get current pressure level for observability / logging.
 */
export function getPressureLevel(): SystemHealthSnapshot["pressure"] {
  return _lastSnapshot?.pressure ?? "normal";
}
