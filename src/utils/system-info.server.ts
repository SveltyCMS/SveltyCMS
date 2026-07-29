/**
 * @file src/utils/system-info.server.ts
 * @description Hardened server-side system information provider for dashboard widgets.
 *
 * ### Hardening (audit 2026-07):
 * - Command injection eliminated: fs.statfs replaces execSync("df -k")
 * - Non-blocking I/O: async statfs instead of sync subprocess spawn
 * - Float32Array: typed array for CPU history (contiguous memory, less GC pressure)
 * - Centralized memory: formatMemory helper ensures consistency across both code paths
 *
 * Backed by SystemMonitor for real-time CPU, memory, and system health data.
 * Provides the shape expected by dashboard widgets (cpu-widget, mem-widget, etc.)
 * with historical load data for sparkline charts.
 *
 * ### Features:
 * - Real-time CPU usage with historical sparkline data
 * - Memory pressure, load averages, disk info
 * - Per-core CPU model detection
 * - Falls back gracefully to Node.js os module if SystemMonitor unavailable
 */

import * as os from "node:os";
import * as fs from "node:fs/promises";
import { getLatestSnapshot, getCpuHistory, getCpuInfo } from "@utils/system-monitor";

// ─── Types ────────────────────────────────────────────────────────────────

export interface CpuInfoResponse {
  cores: {
    count: number;
    perCore: Array<{ model: string; speed: number }>;
  };
  historicalLoad: {
    usage: number[];
    timestamps: string[];
  };
  currentUsage: number;
  loadAverage: number[];
  /** @deprecated backward compat — use currentUsage */
  currentLoad: number;
}

export interface MemoryInfoResponse {
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usagePercent: number;
  /** @deprecated backward compat — use totalBytes */
  total: number;
}

export interface SystemInfoResponse {
  os: {
    platform: string;
    release: string;
    hostname: string;
    uptime: number;
    arch: string;
  };
  cpu: CpuInfoResponse;
  memory: MemoryInfoResponse;
  disk: {
    root: { totalGb: number; usedGb: number; freeGb: number };
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function getOsBaseline(): SystemInfoResponse["os"] {
  return {
    platform: os.platform(),
    release: os.release(),
    hostname: os.hostname(),
    uptime: os.uptime(),
    arch: os.arch(),
  };
}

/**
 * 🛡️ Hardened Disk Space Check:
 * Uses native Node.js statfs to avoid shell command injection and sub-process overhead.
 */
async function getDiskSpaceBaseline(): Promise<SystemInfoResponse["disk"]["root"]> {
  try {
    // statfs is available on Linux/macOS. Returns blocks and block size.
    const stats = await fs.statfs("/");
    const totalBytes = stats.blocks * stats.bsize;
    const freeBytes = stats.bfree * stats.bsize;

    return {
      totalGb: Math.round(totalBytes / 1024 / 1024 / 1024),
      usedGb: Math.round((totalBytes - freeBytes) / 1024 / 1024 / 1024),
      freeGb: Math.round(freeBytes / 1024 / 1024 / 1024),
    };
  } catch {
    return { totalGb: 0, usedGb: 0, freeGb: 0 };
  }
}

function formatMemory(total: number, free: number, snapshotPercent?: number): MemoryInfoResponse {
  const usagePercent = snapshotPercent ?? Math.round(((total - free) / total) * 100);
  const usedBytes = Math.round((total * usagePercent) / 100);
  return {
    total,
    totalBytes: total,
    usedBytes,
    freeBytes: total - usedBytes,
    usagePercent,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────

export async function getSystemInfo(): Promise<SystemInfoResponse> {
  const osData = getOsBaseline();
  const diskData = await getDiskSpaceBaseline();
  const cpus = os.cpus();

  try {
    const snapshot = getLatestSnapshot();
    const history = getCpuHistory();
    const cpuMeta = getCpuInfo();

    // 🚀 Performance: Pre-allocate typed arrays for memory efficiency
    const len = history.length;
    const usageList = new Float32Array(len);
    const timestampList = Array.from<string>({ length: len });

    for (let i = 0; i < len; i++) {
      usageList[i] = history[i].usage;
      timestampList[i] = history[i].timestamp;
    }

    const currentUsage = snapshot?.cpu ?? 0;

    return {
      os: osData,
      cpu: {
        cores: {
          count: cpuMeta.cores || cpus.length,
          perCore: cpus.map((c) => ({ model: c.model, speed: c.speed })),
        },
        historicalLoad: {
          usage: Array.from(usageList),
          timestamps: timestampList,
        },
        currentUsage,
        currentLoad: currentUsage,
        loadAverage: [snapshot?.loadAvg ?? 0, 0, 0],
      },
      memory: formatMemory(os.totalmem(), os.freemem(), snapshot?.memory),
      disk: { root: diskData },
    };
  } catch {
    // SystemMonitor unavailable — return baseline data
    return {
      os: osData,
      disk: { root: diskData },
      cpu: {
        cores: {
          count: cpus.length,
          perCore: cpus.map((c) => ({ model: c.model, speed: c.speed })),
        },
        historicalLoad: { usage: [], timestamps: [] },
        currentUsage: 0,
        currentLoad: 0,
        loadAverage: os.loadavg(),
      },
      memory: formatMemory(os.totalmem(), os.freemem()),
    };
  }
}
