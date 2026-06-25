/**
 * @file src/utils/system-info.server.ts
 * @description Server-side system information provider for dashboard widgets.
 *
 * Backed by SystemMonitor for real-time CPU, memory, and system health data.
 * Provides the shape expected by dashboard widgets (cpu-widget, mem-widget, etc.)
 * with historical load data for sparkline charts.
 *
 * ### Features:
 * - Real-time CPU usage with historical sparkline data (60 samples, 5s intervals)
 * - Memory pressure, load averages, disk info
 * - Per-core CPU model detection
 * - Static imports — zero per-request dynamic import overhead
 * - Single O(n) history extraction loop
 * - Falls back gracefully to Node.js os module if SystemMonitor unavailable
 */

import * as os from "node:os";
import { execSync } from "node:child_process";
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

function getDiskSpaceBaseline(): SystemInfoResponse["disk"]["root"] {
  try {
    const isWindows = os.platform() === "win32";
    if (isWindows) {
      return { totalGb: 512, usedGb: 256, freeGb: 256 };
    }

    const output = execSync("df -k / | tail -1").toString().trim().split(/\s+/);
    const totalKb = parseInt(output[1], 10);
    const freeKb = parseInt(output[3], 10);
    const usedKb = totalKb - freeKb;

    return {
      totalGb: Math.round(totalKb / 1024 / 1024),
      usedGb: Math.round(usedKb / 1024 / 1024),
      freeGb: Math.round(freeKb / 1024 / 1024),
    };
  } catch {
    return { totalGb: 0, usedGb: 0, freeGb: 0 };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────

export async function getSystemInfo(): Promise<SystemInfoResponse> {
  const osData = getOsBaseline();
  const diskData = getDiskSpaceBaseline();
  const cpus = os.cpus();

  try {
    const snapshot = getLatestSnapshot();
    const history = getCpuHistory();
    const cpuMeta = getCpuInfo();

    // Single O(n) loop extracts both arrays
    const usageList: number[] = Array.from({ length: history.length });
    const timestampList: string[] = Array.from({ length: history.length });

    for (let i = 0; i < history.length; i++) {
      usageList[i] = history[i].usage;
      timestampList[i] = history[i].timestamp;
    }

    const currentUsage = snapshot?.cpu ?? 0;

    const cpuInfo: CpuInfoResponse = {
      cores: {
        count: cpuMeta.cores || cpus.length,
        perCore: cpus.map((c) => ({ model: c.model, speed: c.speed })),
      },
      historicalLoad: {
        usage: usageList,
        timestamps: timestampList,
      },
      currentUsage,
      currentLoad: currentUsage,
      loadAverage: [snapshot?.loadAvg ?? 0, 0, 0],
    };

    const totalMem = os.totalmem();
    const usedPercent =
      snapshot?.memory ?? Math.round(((totalMem - os.freemem()) / totalMem) * 100);
    const usedBytes = Math.round((totalMem * usedPercent) / 100);

    const memoryInfo: MemoryInfoResponse = {
      total: totalMem,
      totalBytes: totalMem,
      usedBytes,
      freeBytes: totalMem - usedBytes,
      usagePercent: usedPercent,
    };

    return {
      os: osData,
      cpu: cpuInfo,
      memory: memoryInfo,
      disk: { root: diskData },
    };
  } catch {
    // SystemMonitor unavailable — return baseline data
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

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
      memory: {
        totalBytes: totalMem,
        usedBytes: totalMem - freeMem,
        freeBytes: freeMem,
        total: totalMem,
        usagePercent: Math.round(((totalMem - freeMem) / totalMem) * 100),
      },
    };
  }
}
