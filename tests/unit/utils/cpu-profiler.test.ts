/**
 * @file tests/unit/utils/cpu-profiler.test.ts
 * @description Unit tests for the env-gated CPU profiler: disabled by default,
 * snapshot files loadable as `.cpuprofile`, rotation bounded.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cpuProfileDir,
  startCpuProfilerIfEnabled,
  stopCpuProfiler,
  takeCpuProfilerSnapshot,
} from "@utils/cpu-profiler";

/** Busy work so V8 has frames to sample (the sampler runs at 1 ms). */
function burnCpu(ms: number): void {
  const deadline = performance.now() + ms;
  let sink = 0;
  while (performance.now() < deadline) sink += Math.sqrt(sink + 1);
  expect(sink).toBeGreaterThan(0);
}

describe("cpu-profiler", () => {
  let dir: string | null = null;
  const savedDir = process.env.SVELTY_CPU_PROFILE;
  const savedInterval = process.env.SVELTY_CPU_PROFILE_INTERVAL_MS;

  beforeEach(() => {
    delete process.env.SVELTY_CPU_PROFILE;
    delete process.env.SVELTY_CPU_PROFILE_INTERVAL_MS;
  });

  afterEach(async () => {
    await stopCpuProfiler();
    if (savedDir === undefined) delete process.env.SVELTY_CPU_PROFILE;
    else process.env.SVELTY_CPU_PROFILE = savedDir;
    if (savedInterval === undefined) delete process.env.SVELTY_CPU_PROFILE_INTERVAL_MS;
    else process.env.SVELTY_CPU_PROFILE_INTERVAL_MS = savedInterval;
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
      dir = null;
    }
  });

  it("stays off while SVELTY_CPU_PROFILE is unset", async () => {
    expect(cpuProfileDir()).toBeNull();
    expect(await startCpuProfilerIfEnabled()).toBe("disabled");
    expect(await takeCpuProfilerSnapshot()).toBeNull();
  });

  it("treats a blank directory as off", async () => {
    process.env.SVELTY_CPU_PROFILE = "   ";
    expect(cpuProfileDir()).toBeNull();
    expect(await startCpuProfilerIfEnabled()).toBe("disabled");
  });

  it("writes a loadable .cpuprofile snapshot when enabled", async (ctx) => {
    dir = mkdtempSync(join(tmpdir(), "svelty-cpu-"));
    process.env.SVELTY_CPU_PROFILE = dir;

    const status = await startCpuProfilerIfEnabled();
    if (status === "unavailable") ctx.skip();

    burnCpu(60);
    const snapshot = await takeCpuProfilerSnapshot();

    expect(snapshot).not.toBeNull();
    expect(snapshot!.bytes).toBeGreaterThan(0);
    // The window we just burned through must have produced real samples.
    expect(snapshot!.samples).toBeGreaterThan(0);

    const profile = JSON.parse(readFileSync(snapshot!.file, "utf8")) as {
      nodes?: unknown[];
      samples?: unknown[];
    };
    expect(Array.isArray(profile.nodes)).toBe(true);
    expect(profile.nodes!.length).toBeGreaterThan(0);
    expect(profile.samples!.length).toBe(snapshot!.samples);
  });

  it("restarts sampling after a snapshot and bounds the directory", async (ctx) => {
    dir = mkdtempSync(join(tmpdir(), "svelty-cpu-"));
    process.env.SVELTY_CPU_PROFILE = dir;

    const status = await startCpuProfilerIfEnabled();
    if (status === "unavailable") ctx.skip();

    for (let i = 0; i < 3; i++) {
      burnCpu(20);
      expect(await takeCpuProfilerSnapshot()).not.toBeNull();
    }

    // Rotation keeps the newest snapshots only — no unbounded growth.
    const snapshots = readdirSync(dir).filter((name) => name.endsWith(".cpuprofile"));
    expect(snapshots.length).toBeGreaterThan(0);
    expect(snapshots.length).toBeLessThanOrEqual(2);
    // Atomic writes leave no temp files behind on the happy path.
    expect(readdirSync(dir).filter((name) => name.endsWith(".tmp"))).toHaveLength(0);

    // Sampling resumed: a later window still yields a profile.
    burnCpu(20);
    const later = await takeCpuProfilerSnapshot();
    expect(later).not.toBeNull();
    expect(later!.samples).toBeGreaterThan(0);
  });

  it("stops cleanly and reports nothing once stopped", async (ctx) => {
    dir = mkdtempSync(join(tmpdir(), "svelty-cpu-"));
    process.env.SVELTY_CPU_PROFILE = dir;

    const status = await startCpuProfilerIfEnabled();
    if (status === "unavailable") ctx.skip();

    burnCpu(20);
    await stopCpuProfiler();
    expect(await takeCpuProfilerSnapshot()).toBeNull();

    // Starting again after a stop is allowed (restart without a process restart).
    expect(await startCpuProfilerIfEnabled()).toBe("started");
  });
});
