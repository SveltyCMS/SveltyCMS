#!/usr/bin/env bun
/**
 * @file scripts/probe/probe-hardware-tiers.ts
 * @description
 * CI/local gate: proves the hardware profile derives from the limits the OS
 * ACTUALLY enforces (cgroup memory + CPU quota) — not from the host's hardware —
 * by running the real `src/utils/hardware-profile.ts` inside memory/CPU-limited
 * containers.
 *
 * Why a container probe instead of a unit test? The unit suite injects the
 * limits; this gate proves `process.constrainedMemory()` and
 * `os.availableParallelism()` are actually read at runtime. It is the regression
 * guard for every budget that used to be a hardcoded absolute (DB pool 20/32,
 * L1 64 MB, body 100 MB): if the derivation stops following the container, this
 * fails even on a 64 GB developer machine.
 *
 * Cases (each asserted against the documented budget table):
 *   1. --memory=256m --cpus=1 → mem=nano,  heap 128 MB, l1 16/8 MB, body 8 MB, dbPool 4
 *   2. --memory=512m --cpus=2 → mem=small, heap 256 MB, l1 32/16 MB, body 16 MB
 *   3. unconstrained         → host total, rssTarget 0 (bare-metal path untouched)
 *
 * The script self-bundles with `bun build` and feeds the bundle to node on
 * stdin — no bind mounts, so it behaves identically on Windows and Linux.
 *
 * Usage:
 *   bun run scripts/probe/probe-hardware-tiers.ts
 *   HARDWARE_PROBE_IMAGE=node:24-alpine bun run scripts/probe/probe-hardware-tiers.ts
 */

import { spawnSync } from "node:child_process";
import { totalmem } from "node:os";
import { fileURLToPath } from "node:url";

import { describeHardware, getHardwareProfile } from "../../src/utils/hardware-profile.ts";

const MB = 1024 * 1024;
const PROBE_IMAGE = process.env.HARDWARE_PROBE_IMAGE || "node:24-alpine";

/** The profile facts the gate asserts — printed as one JSON line by the inner probe. */
interface ProbeResult {
  cores: number;
  hostCores: number;
  tier: string;
  memTier: string;
  effectiveMemoryBytes: number;
  hostTotalBytes: number;
  nodeHeapMb: number;
  rssTargetMb: number;
  l1CacheMb: number;
  l1PointCacheMb: number;
  bodySizeLimitMb: number;
  dbPoolSize: number;
  workerPoolSize: number;
  threadPoolSize: number;
  summary: string;
}

/** Runs INSIDE the container: print the real derived profile as one JSON line. */
function runInnerProbe(): void {
  const profile = getHardwareProfile();
  const payload: ProbeResult = {
    cores: profile.cores,
    hostCores: profile.hostCores,
    tier: profile.tier,
    memTier: profile.memTier,
    effectiveMemoryBytes: profile.effectiveMemoryBytes,
    hostTotalBytes: totalmem(),
    nodeHeapMb: profile.nodeHeapMb,
    rssTargetMb: profile.rssTargetMb,
    l1CacheMb: profile.l1CacheMb,
    l1PointCacheMb: profile.l1PointCacheMb,
    bodySizeLimitMb: profile.bodySizeLimitMb,
    dbPoolSize: profile.dbPoolSize,
    workerPoolSize: profile.workerPoolSize,
    threadPoolSize: profile.threadPoolSize,
    summary: describeHardware(profile),
  };
  console.log(`PROBE_JSON ${JSON.stringify(payload)}`);
}

interface ProbeCase {
  name: string;
  dockerArgs: string[];
  verify: (result: ProbeResult) => string[];
}

function check(failures: string[], ok: boolean, message: string): void {
  if (!ok) failures.push(message);
}

function checkEqual(failures: string[], label: string, actual: unknown, expected: unknown): void {
  check(failures, actual === expected, `${label}: expected ${expected}, got ${actual}`);
}

/** Boots the bundle inside the container and parses the probe line back out. */
function runInContainer(
  bundle: string,
  dockerArgs: string[],
): { result?: ProbeResult; error?: string } {
  const args = [
    "run",
    "--rm",
    "-i",
    "--network=none",
    ...dockerArgs,
    "-e",
    "HARDWARE_TIER_PROBE_INNER=1",
    PROBE_IMAGE,
    "node",
    "--input-type=module",
    "-",
  ];
  const res = spawnSync("docker", args, {
    input: bundle,
    encoding: "utf8",
    timeout: 180_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (res.error) return { error: `docker spawn failed: ${res.error.message}` };
  if (res.status !== 0) {
    return { error: `container exited with ${res.status}\n${(res.stderr || "").trim()}` };
  }
  const line = (res.stdout || "").split("\n").find((l) => l.startsWith("PROBE_JSON "));
  if (!line) return { error: `no PROBE_JSON line on stdout:\n${(res.stdout || "").trim()}` };
  return { result: JSON.parse(line.slice("PROBE_JSON ".length)) as ProbeResult };
}

/** ≤70 % invariant: heap + L1 budgets must leave room for the rest of the process. */
function checkFits(failures: string[], result: ProbeResult, limitMb: number): void {
  const usedMb = result.nodeHeapMb + result.l1CacheMb + result.l1PointCacheMb;
  check(
    failures,
    usedMb <= limitMb * 0.7,
    `≤70% invariant: heap+l1 = ${usedMb} MB exceeds ${Math.floor(limitMb * 0.7)} MB of ${limitMb} MB`,
  );
}

function buildCases(): ProbeCase[] {
  return [
    {
      name: "nano VPS — 256 MB / 1 CPU",
      dockerArgs: ["--memory=256m", "--cpus=1"],
      verify: (r) => {
        const f: string[] = [];
        checkEqual(f, "cores", r.cores, 1);
        checkEqual(f, "memTier", r.memTier, "nano");
        checkEqual(f, "effectiveMemoryBytes", r.effectiveMemoryBytes, 256 * MB);
        checkEqual(f, "nodeHeapMb", r.nodeHeapMb, 128);
        checkEqual(f, "rssTargetMb", r.rssTargetMb, 192);
        checkEqual(f, "l1CacheMb", r.l1CacheMb, 16);
        checkEqual(f, "l1PointCacheMb", r.l1PointCacheMb, 8);
        checkEqual(f, "bodySizeLimitMb", r.bodySizeLimitMb, 8);
        checkEqual(f, "dbPoolSize", r.dbPoolSize, 4);
        checkEqual(f, "workerPoolSize", r.workerPoolSize, 2);
        checkEqual(f, "threadPoolSize", r.threadPoolSize, 4);
        checkFits(f, r, 256);
        return f;
      },
    },
    {
      name: "small VPS — 512 MB / 2 CPU",
      dockerArgs: ["--memory=512m", "--cpus=2"],
      verify: (r) => {
        const f: string[] = [];
        checkEqual(f, "cores", r.cores, 2);
        checkEqual(f, "memTier", r.memTier, "small");
        checkEqual(f, "effectiveMemoryBytes", r.effectiveMemoryBytes, 512 * MB);
        checkEqual(f, "nodeHeapMb", r.nodeHeapMb, 256);
        checkEqual(f, "rssTargetMb", r.rssTargetMb, 384);
        checkEqual(f, "l1CacheMb", r.l1CacheMb, 32);
        checkEqual(f, "l1PointCacheMb", r.l1PointCacheMb, 16);
        checkEqual(f, "bodySizeLimitMb", r.bodySizeLimitMb, 16);
        checkEqual(f, "dbPoolSize", r.dbPoolSize, 4);
        checkFits(f, r, 512);
        return f;
      },
    },
    {
      name: "unconstrained — bare metal / VM without cgroup",
      dockerArgs: [],
      verify: (r) => {
        const f: string[] = [];
        // No memory cap ⇒ effective memory IS the host total and no RSS target
        // is invented (the governor falls back to the V8 heap limit instead).
        checkEqual(
          f,
          "effectiveMemoryBytes === hostTotalBytes",
          r.effectiveMemoryBytes,
          r.hostTotalBytes,
        );
        checkEqual(f, "rssTargetMb", r.rssTargetMb, 0);
        return f;
      },
    },
  ];
}

function main(): void {
  if (process.env.HARDWARE_TIER_PROBE_INNER === "1") {
    runInnerProbe();
    return;
  }

  const dockerVersion = spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], {
    encoding: "utf8",
  });
  if (dockerVersion.error || dockerVersion.status !== 0) {
    console.error(
      "[hardware-probe] ❌ Docker is required to prove the cgroup tier derivation (daemon not reachable).",
    );
    console.error("    Start Docker Desktop / the daemon and re-run this script.");
    process.exitCode = 1;
    return;
  }

  const entry = fileURLToPath(import.meta.url);
  const build = spawnSync("bun", ["build", entry, "--target=node", "--format=esm"], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (build.error || build.status !== 0 || !build.stdout) {
    console.error(`[hardware-probe] ❌ bun build failed:\n${(build.stderr || "").trim()}`);
    process.exitCode = 1;
    return;
  }
  const bundle = build.stdout;

  const cases = buildCases();
  let failed = 0;
  for (const testCase of cases) {
    const { result, error } = runInContainer(bundle, testCase.dockerArgs);
    if (error || !result) {
      console.error(`[hardware-probe] ❌ ${testCase.name}: ${error ?? "no result"}`);
      failed += 1;
      continue;
    }
    const failures = testCase.verify(result);
    if (failures.length > 0) {
      console.error(`[hardware-probe] ❌ ${testCase.name}`);
      for (const failure of failures) console.error(`    - ${failure}`);
      failed += 1;
    } else {
      console.log(`[hardware-probe] ✅ ${testCase.name}`);
      console.log(`    ${result.summary}`);
    }
  }

  if (failed > 0) {
    console.error(`[hardware-probe] ❌ ${failed}/${cases.length} case(s) failed`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `[hardware-probe] ✅ ${cases.length}/${cases.length} tiers derive from the container limits (image ${PROBE_IMAGE})`,
  );
}

main();
