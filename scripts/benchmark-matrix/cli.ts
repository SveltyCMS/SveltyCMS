/**
 * @file scripts/benchmark-matrix/cli.ts
 * @description Host info collection for benchmark reporting.
 */

export async function collectHostInfo(): Promise<Record<string, string>> {
  try {
    const os = await import("node:os");
    const cpuModel = os.cpus()[0]?.model?.trim() || "Unknown";
    const runtime = typeof Bun !== "undefined" ? `Bun ${Bun.version}` : `Node ${process.version}`;
    return {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      cpu: cpuModel,
      cpus: String(os.cpus().length),
      memory: `${Math.round(os.totalmem() / 1024 / 1024 / 1024)}GB`,
      runtime,
    };
  } catch {
    return {};
  }
}
