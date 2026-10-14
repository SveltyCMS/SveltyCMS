/**
 * @file tests/unit/services/memory-governor-profile-target.test.ts
 * @description Anti-drift contract: the memory governor adopts the HARDWARE
 * PROFILE's derived RSS target, so the boot line and the governor can never
 * report different numbers for the same box.
 *
 * Features:
 * - A constrained process (HARDWARE_MEM_LIMIT_MB) exposes `profile.rssTargetMb`
 * - The governor fires on RSS against THAT target — with `snap.constrained = 0`,
 *   proving the profile (not the cgroup snapshot or the heap fallback) drove it
 * - An explicit `SVELTY_MEMORY_RSS_MB` still wins over the profile
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { MemoryGovernorDeps, MemorySnapshot } from "@src/services/system/memory-governor";

const MB = 1024 * 1024;
const HW_KEY = "__SVELTY_HARDWARE_PROFILE__";

/**
 * Fresh module graph + cleared global registry, so the profile rebuilds from the
 * env this test sets (the profile is memoized per process by design).
 */
async function loadFresh() {
  vi.resetModules();
  const nativeUtils = await import("@utils/native-utils");
  nativeUtils.setGlobal(HW_KEY, null);
  const hw = await import("@utils/hardware-profile");
  const gov = await import("@src/services/system/memory-governor");
  return { hw, gov };
}

function busyDeps(snap: MemorySnapshot): MemoryGovernorDeps & { log: ReturnType<typeof vi.fn> } {
  let clock = 1_000_000;
  const log = vi.fn();
  return {
    read: () => snap,
    gc: vi.fn(async () => {}),
    yieldToLoop: async () => {},
    trimCaches: vi.fn(),
    now: () => (clock += 2_000),
    log,
  };
}

afterEach(() => {
  delete process.env.HARDWARE_MEM_LIMIT_MB;
  delete process.env.SVELTY_MEMORY_RSS_MB;
  delete process.env.SVELTY_MEMORY_CONSTRAINED_RATIO;
});

describe("governor ↔ hardware profile RSS target", () => {
  it("exposes the derived target for a simulated 1 GB container", async () => {
    process.env.HARDWARE_MEM_LIMIT_MB = "1024";
    const { hw } = await loadFresh();

    const profile = hw.getHardwareProfile();
    expect(profile.memTier).toBe("medium");
    // 1024 × 0.75 — the SAME ratio knob the governor reads.
    expect(profile.rssTargetMb).toBe(768);
  });

  it("fires on RSS against the profile target, not the heap-limit fallback", async () => {
    process.env.HARDWARE_MEM_LIMIT_MB = "1024";
    const { gov } = await loadFresh();

    // rss 900 MB > profile target 768 MB, but far below heapLimit × 1.25
    // (5120 MB) — and `constrained: 0` removes the cgroup branch entirely, so
    // only the profile target can trigger here.
    const snap: MemorySnapshot = {
      rss: 900 * MB,
      heapUsed: 20 * MB,
      heapLimit: 4096 * MB,
      external: 2 * MB,
      arrayBuffers: 1 * MB,
      cpuMs: 0,
      constrained: 0,
    };
    const deps = busyDeps(snap);
    const governor = new gov.MemoryGovernor(deps, {});

    await governor.tick();

    expect(deps.gc).toHaveBeenCalled();
    expect(deps.log.mock.calls[0]?.[0]).toContain("rss");
  });

  it("keeps an explicit SVELTY_MEMORY_RSS_MB as the operator override", async () => {
    process.env.HARDWARE_MEM_LIMIT_MB = "1024";
    process.env.SVELTY_MEMORY_RSS_MB = "2000";
    const { hw } = await loadFresh();

    expect(hw.getHardwareProfile().rssTargetMb).toBe(2000);
  });
});
