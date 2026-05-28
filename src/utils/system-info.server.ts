/**
 * @file src/utils/system-info.server.ts
 * @description
 * Server-side utility for gathering system hardware, OS, memory, swap, and disk metrics.
 *
 * Responsibilities include:
 * - Tracking and Norming CPU load history periodically with HMR resilience.
 * - Collecting CPU cores, models, and load averages.
 * - Checking memory usage and allocations.
 * - Querying disk usage dynamically using native POSIX and Windows filesystem calls.
 *
 * ### Features:
 * - CPU performance load telemetry and 30-point history cache
 * - Memory and Linux swap space diagnostics
 * - Multi-disk space querying via native fs.statfs
 */

import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";

interface SingleDiskStats {
  totalGb: number;
  usedGb: number;
  freeGb: number;
  usedPercentage: number;
  mountPoint: string;
  filesystem: string;
}

interface HistoricalLoad {
  usage: number[];
  timestamps: string[];
}

// Dev-resilient global history cache to survive HMR restarts
const globalWithHistory = globalThis as typeof globalThis & {
  __CPU_HISTORY__?: HistoricalLoad;
  __CPU_INTERVAL_ID__?: NodeJS.Timeout;
};

if (!globalWithHistory.__CPU_HISTORY__) {
  globalWithHistory.__CPU_HISTORY__ = {
    usage: [],
    timestamps: [],
  };
}

const cpuHistory = globalWithHistory.__CPU_HISTORY__;
const HISTORY_MAX = 30;
const HISTORY_INTERVAL = 5000; // 5 seconds

if (!globalWithHistory.__CPU_INTERVAL_ID__) {
  globalWithHistory.__CPU_INTERVAL_ID__ = setInterval(() => {
    const load = os.loadavg()[0]; // 1-minute load average
    const normalized = Math.min(100, Math.max(0, Math.round(load * 25))); // Rough normalization

    cpuHistory.usage.push(normalized);
    cpuHistory.timestamps.push(new Date().toISOString());

    if (cpuHistory.usage.length > HISTORY_MAX) {
      cpuHistory.usage.shift();
      cpuHistory.timestamps.shift();
    }
  }, HISTORY_INTERVAL);
  // Unref the timer so it doesn't block process exit (cleaner tests/reloads)
  globalWithHistory.__CPU_INTERVAL_ID__.unref();
}

/**
 * Gathers Linux swap information by parsing /proc/meminfo.
 */
async function getLinuxSwapInfo() {
  try {
    const content = await fs.readFile("/proc/meminfo", "utf8");
    const swapTotalMatch = content.match(/^SwapTotal:\s+(\d+)\s+kB/m);
    const swapFreeMatch = content.match(/^SwapFree:\s+(\d+)\s+kB/m);
    if (swapTotalMatch && swapFreeMatch) {
      const totalKb = parseInt(swapTotalMatch[1], 10);
      const freeKb = parseInt(swapFreeMatch[1], 10);
      const usedKb = totalKb - freeKb;
      return {
        total: totalKb * 1024,
        free: freeKb * 1024,
        used: usedKb * 1024,
        percentUsed: totalKb > 0 ? Math.round((usedKb / totalKb) * 100) : 0,
      };
    }
  } catch {
    // Ignore if read fails
  }
  return null;
}

/**
 * Gathers storage details for a single filesystem mount path.
 */
async function getSingleDiskInfo(mountPath: string): Promise<SingleDiskStats | null> {
  try {
    const stats = await fs.statfs(mountPath);
    if (!stats || stats.blocks <= 0) return null;
    const bsize = stats.bsize;
    const totalBytes = Number(stats.blocks) * bsize;
    const freeBytes = Number(stats.bavail) * bsize;
    const usedBytes = totalBytes - freeBytes;

    const totalGb = totalBytes / 1024 ** 3;
    const usedGb = usedBytes / 1024 ** 3;
    const freeGb = freeBytes / 1024 ** 3;
    const usedPercentage = totalGb > 0 ? (usedGb / totalGb) * 100 : 0;

    return {
      totalGb: parseFloat(totalGb.toFixed(1)),
      usedGb: parseFloat(usedGb.toFixed(1)),
      freeGb: parseFloat(freeGb.toFixed(1)),
      usedPercentage: parseFloat(usedPercentage.toFixed(1)),
      mountPoint: mountPath,
      filesystem: os.platform() === "win32" ? "NTFS" : "ext4",
    };
  } catch {
    return null;
  }
}

/**
 * Gathers system information for the dashboard.
 */
export async function getSystemInfo() {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  // Disk info
  const disk: Record<string, SingleDiskStats> = {};
  const isWin = os.platform() === "win32";

  if (isWin) {
    const projectDrive = path.resolve(".").substring(0, 3); // e.g. "D:\" or "C:\"
    const systemDrive = "C:\\";
    const drives = [projectDrive, systemDrive, "D:\\", "E:\\"].filter(Boolean);

    for (const drive of drives) {
      const info = await getSingleDiskInfo(drive);
      if (info) {
        const key = drive.replace(/[\\:]/g, "").toLowerCase() || "root";
        disk[key] = info;
        if (drive.toLowerCase() === projectDrive.toLowerCase()) {
          disk.root = info;
        }
      }
    }
  } else {
    // Linux/macOS
    const paths = ["/", "/home", "/var", "/tmp"];
    for (const p of paths) {
      const info = await getSingleDiskInfo(p);
      if (info) {
        const key = p === "/" ? "root" : p.substring(1);
        disk[key] = info;
      }
    }
  }

  // Gather swap info on Linux
  let swap = null;
  if (os.platform() === "linux") {
    swap = await getLinuxSwapInfo();
  }

  return {
    timestamp: new Date().toISOString(),

    os: {
      platform: os.platform(),
      type: os.type(),
      release: os.release(),
      arch: os.arch(),
      uptime: Math.floor(os.uptime()),
      hostname: os.hostname(),
    },

    cpu: {
      model: cpus.length > 0 ? cpus[0].model?.trim() || "unknown" : "unknown",
      cores: {
        count: cpus.length,
        physical: os
          .cpus()
          .filter((cpu, i, arr) => i === arr.findIndex((c) => c.model === cpu.model)).length,
      },
      loadAvg: os.loadavg(),
      historicalLoad: cpuHistory,
    },

    memory: {
      total: {
        totalMemMb: Math.floor(totalMem / 1024 / 1024),
        usedMemMb: Math.floor(usedMem / 1024 / 1024),
        freeMemMb: Math.floor(freeMem / 1024 / 1024),
        usedMemPercentage: Math.round((usedMem / totalMem) * 100),
      },
      swap: swap
        ? {
            totalMemMb: Math.floor(swap.total / 1024 / 1024),
            usedMemMb: Math.floor(swap.used / 1024 / 1024),
            freeMemMb: Math.floor(swap.free / 1024 / 1024),
            usedMemPercentage: swap.percentUsed,
          }
        : null,
      // Keep top-level fields for backward compatibility
      totalBytes: totalMem,
      freeBytes: freeMem,
      usedBytes: usedMem,
      percentUsed: Math.round((usedMem / totalMem) * 100),
    },

    disk,

    node: {
      version: process.version,
      uptime: Math.floor(process.uptime()),
      memoryUsage: process.memoryUsage(),
    },
  };
}
