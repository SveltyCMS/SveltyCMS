/**
 * @file src/utils/system-info.server.ts
 * @description Server-side utility for gathering system hardware and OS metrics.
 * features: CPU usage, memory allocation, OS information, process uptime.
 */

import os from "node:os";

/**
 * Gathers system information for the dashboard.
 */
export async function getSystemInfo() {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  return {
    os: {
      platform: os.platform(),
      type: os.type(),
      release: os.release(),
      arch: os.arch(),
      uptime: os.uptime(),
      hostname: os.hostname(),
    },
    cpu: {
      model: cpus.length > 0 ? cpus[0].model : "unknown",
      cores: cpus.length,
      loadAvg: os.loadavg(),
    },
    memory: {
      total: totalMem,
      free: freeMem,
      used: usedMem,
      percentUsed: Math.round((usedMem / totalMem) * 100),
    },
    node: {
      version: process.version,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
    },
    timestamp: new Date().toISOString(),
  };
}
