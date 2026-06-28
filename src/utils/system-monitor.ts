/**
 * @file src/utils/system-monitor.ts
 * @description Highly optimized hardware-aware system monitor.
 *
 * Uses process.cpuUsage() delta tracking for zero-blocking CPU measurement,
 * node-os-utils for memory/load sensing, and perf_hooks for event loop lag.
 * Drives hardware-aware rate limiting (documented in state-management.mdx).
 *
 * ### Features:
 * - Zero-blocking CPU via process.cpuUsage() delta (no 100ms osu.cpu.usage call)
 * - Static ES module imports, lazy dependency init
 * - Reusable snapshot objects, low GC pressure
 * - Rolling historical buffer (60 samples, 5s intervals)
 * - getPressureMultiplier() — adaptive 0.8x–2.0x for rate limit cost adjustment
 * - shouldRejectMutations() — defensive gating when heap exceeds 90%
 * - Singleton, auto-started on first access
 */

import { monitorEventLoopDelay } from "node:perf_hooks";
import os from "node:os";
import v8 from "node:v8";
import { logger } from "@utils/logger";

// ─── Types ────────────────────────────────────────────────────────────────

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

const HISTORY_SIZE = 60;
const SAMPLE_INTERVAL_MS = 5000;

const PRESSURE_THRESHOLDS = {
  idleCpu: 30,
  idleMem: 50,
  elevatedCpu: 70,
  elevatedMem: 80,
  criticalCpu: 90,
  criticalMem: 92,
  criticalLag: 80,
  rejectHeap: 90,
};

// ─── State ────────────────────────────────────────────────────────────────

let _started = false;
let _interval: ReturnType<typeof setInterval> | null = null;
let _lastSnapshot: SystemHealthSnapshot | null = null;
const _history: HistoricalPoint[] = [];

let _lagHistogram: ReturnType<typeof monitorEventLoopDelay> | null = null;
let _osuCpu: any = null;
let _osuMem: any = null;

// Static hardware descriptors cached once on initialization
let _cpuCores = 1;
let _cpuModel = "Unknown";

// State tracking for high-performance CPU delta calculation
let _lastCpuUsage = process.cpuUsage();
let _lastCpuTime = Date.now();

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Calculates CPU usage over the interval window instantly without blocking */
function calculateCpuUsagePercentage(): number {
  const currentCpuUsage = process.cpuUsage(_lastCpuUsage);
  const currentTime = Date.now();
  const timeDeltaMs = currentTime - _lastCpuTime;

  _lastCpuUsage = process.cpuUsage(); // reset markers
  _lastCpuTime = currentTime;

  if (timeDeltaMs <= 0) return 0;

  // Convert microseconds to milliseconds, distribute across CPU cores
  const totalCpuTimeMs = (currentCpuUsage.user + currentCpuUsage.system) / 1000;
  const percent = (totalCpuTimeMs / (timeDeltaMs * _cpuCores)) * 100;

  return Math.min(Math.round(percent), 100);
}

async function lazyLoadDependencies(): Promise<boolean> {
  if (_osuCpu && _osuMem) return true;
  try {
    const osu = await import("node-os-utils");
    const osuRoot = (osu as any).default || osu;
    _osuCpu = osuRoot.cpu;
    _osuMem = osuRoot.mem;
    _cpuCores = _osuCpu?.count?.() ?? os.cpus().length ?? 1;
    _cpuModel = _osuCpu?.model?.() ?? os.cpus()[0]?.model ?? "Unknown";
    return true;
  } catch (err) {
    logger.error("[SystemMonitor] Failed to load dependency node-os-utils", err);
    return false;
  }
}

function getHeapUsedPercent(): number {
  const { heapUsed } = process.memoryUsage();
  const heapLimit = v8.getHeapStatistics().heap_size_limit;
  return Math.round((heapUsed / (heapLimit || 1)) * 100);
}

function getEventLoopLagMs(): number {
  if (!_lagHistogram) return 0;
  try {
    // Return p95 lag converted from nanoseconds to milliseconds
    return Math.round((_lagHistogram.percentile(95) / 1e6) * 100) / 100;
  } catch {
    return 0;
  }
}

function determinePressure(
  cpu: number,
  mem: number,
  lag: number,
): SystemHealthSnapshot["pressure"] {
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
  const depsLoaded = await lazyLoadDependencies();

  let memPercent = 0;
  let loadAvg = 0;

  if (depsLoaded) {
    try {
      const memInfo = await _osuMem.info();
      memPercent = Math.round(memInfo.usedMemPercentage ?? 0);
      loadAvg = _osuCpu.loadavgTime?.(1) ?? os.loadavg()?.[0] ?? 0;
    } catch {
      // non-critical sensor failure — continue with defaults
    }
  }

  const cpuPercent = calculateCpuUsagePercentage();
  const lag = getEventLoopLagMs();

  // Reset histogram windows between pollings to prevent lifetime-diluted metrics
  if (_lagHistogram) {
    _lagHistogram.reset();
  }

  const snapshot: SystemHealthSnapshot = {
    timestamp: Date.now(),
    cpu: cpuPercent,
    memory: memPercent,
    loadAvg,
    eventLoopLagMs: lag,
    heapUsedPercent: getHeapUsedPercent(),
    pressure: determinePressure(cpuPercent, memPercent, lag),
  };

  _lastSnapshot = snapshot;

  // Track historical data
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

export function startSystemMonitor(): void {
  if (_started) return;

  try {
    _lagHistogram = monitorEventLoopDelay({ resolution: 20 });
    _lagHistogram.enable();
  } catch (err) {
    logger.warn("[SystemMonitor] Event loop delay monitoring unavailable", err);
  }

  // Pre-seed CPU timing ticks immediately
  _lastCpuUsage = process.cpuUsage();
  _lastCpuTime = Date.now();

  collectSnapshot().catch(() => {});

  _interval = setInterval(() => {
    collectSnapshot().catch(() => {});
  }, SAMPLE_INTERVAL_MS);

  _started = true;
  logger.info("[SystemMonitor] Hardware-aware monitoring active");
}

export function stopSystemMonitor(): void {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
  }
  if (_lagHistogram) {
    try {
      _lagHistogram.disable();
    } catch {
      // best-effort cleanup
    }
    _lagHistogram = null;
  }
  _started = false;
}

export function getLatestSnapshot(): SystemHealthSnapshot | null {
  if (!_started) startSystemMonitor();
  return _lastSnapshot;
}

export function getCpuHistory(): HistoricalPoint[] {
  if (!_started) startSystemMonitor();
  return _history;
}

export function getCpuInfo(): { cores: number; model: string } {
  if (!_started) startSystemMonitor();
  return { cores: _cpuCores, model: _cpuModel };
}

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

export function shouldRejectMutations(): boolean {
  if (!_started || !_lastSnapshot) return false;
  return _lastSnapshot.heapUsedPercent > PRESSURE_THRESHOLDS.rejectHeap;
}

export function getPressureLevel(): SystemHealthSnapshot["pressure"] {
  return _lastSnapshot?.pressure ?? "normal";
}

export const systemMonitor = {
  getAdaptiveCostMultiplier: getPressureMultiplier,
  getPressureLevel,
  shouldRejectMutations,
  getLatestSnapshot,
  getCpuHistory,
  getCpuInfo,
  start: startSystemMonitor,
  stop: stopSystemMonitor,
};
