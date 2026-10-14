/**
 * @file tests/unit/utils/hardware-profile-memory.test.ts
 * @description Memory-tier derivation + budget invariants for hardware-profile.
 *
 * Features:
 * - Tier boundaries (nano/small/medium/large/xlarge) on the EFFECTIVE limit
 * - Budget rows are monotonic across deployment classes (256 MB → 64 GB)
 * - ≤70 % invariant: heap + L1 list + L1 point fit the row's memory floor
 * - Caps never undercut the functional minimums (workers ≥2, pool ≥4, …)
 */

import { afterEach, describe, it, expect, vi } from "vitest";
import {
  classifyMemoryTier,
  deriveBodyLimitMb,
  deriveMemoryBudgets,
  deriveNodeHeapMb,
  deriveRssTargetMb,
  isHeapAligned,
  isMemoryConstrained,
  type MemoryBudgets,
} from "@utils/hardware-profile";

const MB = 1024 * 1024;
const mb = (n: number) => n * MB;

/** Every deployment class named in the brief, plus in-between sizes. */
const SIZES_MB = [256, 300, 512, 768, 1024, 1536, 2048, 3072, 4096, 8192, 16384, 32768, 65536];

describe("classifyMemoryTier", () => {
  it("maps the effective limit to the documented tiers", () => {
    expect(classifyMemoryTier(mb(256))).toBe("nano");
    expect(classifyMemoryTier(mb(511))).toBe("nano");
    expect(classifyMemoryTier(mb(512))).toBe("small");
    expect(classifyMemoryTier(mb(1023))).toBe("small");
    expect(classifyMemoryTier(mb(1024))).toBe("medium");
    expect(classifyMemoryTier(mb(2047))).toBe("medium");
    expect(classifyMemoryTier(mb(2048))).toBe("large");
    expect(classifyMemoryTier(mb(8191))).toBe("large");
    expect(classifyMemoryTier(mb(8192))).toBe("xlarge");
  });

  it("treats a cgroup limit and the host total identically (both are bytes)", () => {
    expect(classifyMemoryTier(mb(2048))).toBe(classifyMemoryTier(mb(2048) + 1024));
  });
});

describe("deriveMemoryBudgets", () => {
  it("returns a budget row for every deployment class", () => {
    for (const size of SIZES_MB) {
      const budgets = deriveMemoryBudgets(mb(size));
      expect(budgets.l1CacheMb).toBeGreaterThan(0);
      expect(budgets.l1PointCacheMb).toBeGreaterThan(0);
      expect(budgets.dbPoolCap).toBeGreaterThan(0);
    }
  });

  it("keeps heap + L1 list + L1 point ≤ 70 % of the effective limit", () => {
    for (const size of SIZES_MB) {
      const limit = mb(size);
      const b = deriveMemoryBudgets(limit);
      const reservedMb = deriveNodeHeapMb(limit) + b.l1CacheMb + b.l1PointCacheMb;
      // ≤ 70 % of the limit — the budget the docs quote for every tier floor.
      expect(reservedMb, `size=${size}MB`).toBeLessThanOrEqual((limit / MB) * 0.7);
    }
  });

  it("scales monotonically with memory", () => {
    const keys: (keyof MemoryBudgets)[] = [
      "l1CacheMb",
      "l1PointCacheMb",
      "dbPoolCap",
      "workerCap",
      "compileCap",
      "jobCap",
      "sharpCap",
    ];
    let prev = deriveMemoryBudgets(mb(SIZES_MB[0]!));
    for (const size of SIZES_MB.slice(1)) {
      const cur = deriveMemoryBudgets(mb(size));
      for (const key of keys) {
        expect(cur[key], `${key} at ${size}MB`).toBeGreaterThanOrEqual(prev[key]);
      }
      prev = cur;
    }
  });

  it("caps never undercut the functional minimums", () => {
    for (const size of SIZES_MB) {
      const b = deriveMemoryBudgets(mb(size));
      expect(b.workerCap, `workers at ${size}MB`).toBeGreaterThanOrEqual(2);
      expect(b.sharpCap, `sharp at ${size}MB`).toBeGreaterThanOrEqual(1);
      expect(b.dbPoolCap, `pool at ${size}MB`).toBeGreaterThanOrEqual(4);
      expect(b.compileCap, `compile at ${size}MB`).toBeGreaterThanOrEqual(4);
      expect(b.jobCap, `jobs at ${size}MB`).toBeGreaterThanOrEqual(5);
    }
  });

  it("gives a 256 MB box a nano budget, not a mid-range one", () => {
    const nano = deriveMemoryBudgets(mb(256));
    expect(deriveNodeHeapMb(mb(256))).toBeLessThanOrEqual(256);
    expect(nano.l1CacheMb).toBeLessThanOrEqual(32);
    expect(deriveBodyLimitMb(mb(256))).toBeLessThanOrEqual(16);
    expect(nano.dbPoolCap).toBeLessThanOrEqual(8);
    expect(nano.sharpCap).toBe(1);
  });
});

/**
 * The launcher (`index.cjs`) cannot import TypeScript, so it mirrors these two
 * ratios. Pinning the documented values here is what keeps the two in step —
 * change a ratio and this test goes red before the launcher drifts.
 */
describe("ratio-derived budgets (mirrored by index.cjs)", () => {
  it("deriveNodeHeapMb pins the documented heap rows", () => {
    expect(deriveNodeHeapMb(mb(256))).toBe(128);
    expect(deriveNodeHeapMb(mb(512))).toBe(256);
    expect(deriveNodeHeapMb(mb(1024))).toBe(512);
    expect(deriveNodeHeapMb(mb(2048))).toBe(1024);
    expect(deriveNodeHeapMb(mb(4096))).toBe(2048);
    expect(deriveNodeHeapMb(mb(8192))).toBe(4096);
    // Clamped at both ends; never above the cap, never below the floor.
    expect(deriveNodeHeapMb(mb(64))).toBe(128);
    expect(deriveNodeHeapMb(mb(65536))).toBe(4096);
  });

  it("deriveBodyLimitMb pins the documented body rows", () => {
    expect(deriveBodyLimitMb(mb(256))).toBe(8);
    expect(deriveBodyLimitMb(mb(512))).toBe(16);
    expect(deriveBodyLimitMb(mb(1024))).toBe(32);
    expect(deriveBodyLimitMb(mb(2048))).toBe(64);
    expect(deriveBodyLimitMb(mb(4096))).toBe(128);
    expect(deriveBodyLimitMb(mb(65536))).toBe(128);
  });
});

describe("deriveRssTargetMb", () => {
  it("is ratio × the effective limit when the process is constrained", () => {
    expect(deriveRssTargetMb(mb(256), true, 0.75)).toBe(192);
    expect(deriveRssTargetMb(mb(512), true, 0.75)).toBe(384);
    expect(deriveRssTargetMb(mb(1024), true, 0.75)).toBe(768);
    expect(deriveRssTargetMb(mb(2048), true, 0.75)).toBe(1536);
  });

  it("is 0 on an unconstrained host (the governor derives from the heap limit)", () => {
    expect(deriveRssTargetMb(mb(65536), false, 0.75)).toBe(0);
  });

  it("clamps the ratio to a sane band", () => {
    // Below 0.25 → 0.25; above 1.0 → 1.0; the target never exceeds the limit.
    expect(deriveRssTargetMb(mb(1024), true, 0.01)).toBe(256);
    expect(deriveRssTargetMb(mb(1024), true, 5)).toBe(1024);
  });

  it("matches the governor's documented default (0.75)", () => {
    // The governor reads SVELTY_MEMORY_CONSTRAINED_RATIO with the same default,
    // so the boot line and the governor can never disagree on the same box.
    const ratio = Number(process.env.SVELTY_MEMORY_CONSTRAINED_RATIO) || 0.75;
    expect(deriveRssTargetMb(mb(2048), true, ratio)).toBe(Math.round(2048 * ratio));
  });
});

describe("isMemoryConstrained", () => {
  it("treats Node's 0 and Bun's host-total report as unconstrained", () => {
    const host = mb(65536);
    // Node, unconstrained.
    expect(isMemoryConstrained(0, host)).toBe(false);
    // Bun reports the HOST TOTAL from constrainedMemory() — not a constraint.
    expect(isMemoryConstrained(host, host)).toBe(false);
  });

  it("treats a real cgroup limit as constrained", () => {
    const host = mb(65536);
    expect(isMemoryConstrained(mb(256), host)).toBe(true);
    expect(isMemoryConstrained(mb(1024), host)).toBe(true);
    expect(isMemoryConstrained(mb(32768), host)).toBe(true);
  });
});

/**
 * Measured (node:24 in Docker): heap_size_limit is 259 MB in a 256 MB container
 * and 560 MB in a 1 GB one — V8 reads cgroups but is NOT conservative on tiny
 * boxes. This is the check the boot log / health endpoint reports.
 */
describe("isHeapAligned", () => {
  it("flags V8's non-conservative cap on a tiny container", () => {
    expect(isHeapAligned(mb(259), mb(256))).toBe(false);
    // The launcher's derived cap (0.5 × limit) is aligned.
    expect(isHeapAligned(mb(128), mb(256))).toBe(true);
    // V8's 1 GB behaviour (560 MB) is inside the 75 % band.
    expect(isHeapAligned(mb(560), mb(1024))).toBe(true);
  });

  it("treats unconstrained hosts and unknown limits as aligned", () => {
    expect(isHeapAligned(mb(4288), mb(65536))).toBe(true);
    expect(isHeapAligned(0, mb(256))).toBe(true);
    expect(isHeapAligned(mb(128), 0)).toBe(true);
  });
});

const HW_KEY = "__SVELTY_HARDWARE_PROFILE__";

/** Fresh module graph + cleared global, so the profile rebuilds from this env. */
async function loadProfile() {
  vi.resetModules();
  const nativeUtils = await import("@utils/native-utils");
  nativeUtils.setGlobal(HW_KEY, null);
  const hw = await import("@utils/hardware-profile");
  return hw.getHardwareProfile();
}

/**
 * A `--cpus=1` container used to look like the host (24 cores → 24 libuv
 * threads, weak-box compression disabled) because `os.cpus()` reports the HOST.
 * The profile must scale every CPU-derived budget from the CPUs actually
 * granted (cgroup quota / cpuset, `HARDWARE_CPU_CORES` in tests).
 */
describe("cgroup-aware CPU budgets", () => {
  afterEach(() => {
    delete process.env.HARDWARE_CPU_CORES;
    delete process.env.HARDWARE_MEM_LIMIT_MB;
  });

  it("scales a 1-vCPU box down to the single tier", async () => {
    process.env.HARDWARE_CPU_CORES = "1";
    process.env.HARDWARE_MEM_LIMIT_MB = "256";
    const profile = await loadProfile();

    expect(profile.cores).toBe(1);
    expect(profile.tier).toBe("single");
    // libuv's floor, not the host's 24 — the regression this guards.
    expect(profile.threadPoolSize).toBe(4);
    expect(profile.sharpConcurrency).toBe(1);
    expect(profile.dbPoolSize).toBeLessThanOrEqual(4);
    expect(profile.workerPoolSize).toBe(2);
    // Weak-box compression: expensive levels must not run on one core.
    expect(profile.gzipLevel).toBe(4);
    expect(profile.brotliQuality).toBe(4);
  });

  it("keeps the headroom on a many-core box", async () => {
    process.env.HARDWARE_CPU_CORES = "16";
    const profile = await loadProfile();

    expect(profile.cores).toBe(16);
    expect(profile.tier).toBe("large");
    expect(profile.threadPoolSize).toBeGreaterThan(4);
    expect(profile.gzipLevel).toBe(9);
  });
});
