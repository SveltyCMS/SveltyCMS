/**
 * @file tests/unit/hooks/fast-lane-policy.test.ts
 * @description Guard for the fast-lane bypass policy: every pipeline hook
 * declared in `hooks.server.ts` must be classified, so a hook added later cannot
 * silently miss lane traffic. Also pins the registry's default-on / opt-out
 * contract and the operational-state gate that replaces `handle-system-state`
 * for lane traffic.
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FAST_LANE_REGISTRY,
  LANE_BYPASSED_HOOKS,
  installFastLanes,
  registerFastLane,
} from "@src/hooks/fast-lane.server";
import { isLaneServingAllowed } from "@src/hooks/lane-state-gate";
import { setSystemState } from "@src/stores/system/state.svelte.ts";

const hooksServerSource = readFileSync(join(process.cwd(), "src", "hooks.server.ts"), "utf8");

type RegistryHost = typeof globalThis & {
  [FAST_LANE_REGISTRY]?: (input: unknown) => Promise<unknown>;
};

const laneInput = {
  method: "GET",
  url: "/api/collections/articles/abc",
  origin: "http://127.0.0.1",
  headers: {},
};

describe("fast-lane bypass policy", () => {
  const savedFlag = process.env.SVELTY_FAST_LANE;

  beforeEach(() => {
    delete (globalThis as RegistryHost)[FAST_LANE_REGISTRY];
    // The gate declines every state except the operational set, so a lane test
    // must start from an operational state or it would pass for the gate's
    // reason instead of the lane's.
    setSystemState("READY");
  });

  afterEach(() => {
    delete (globalThis as RegistryHost)[FAST_LANE_REGISTRY];
    setSystemState("READY");
    if (savedFlag === undefined) delete process.env.SVELTY_FAST_LANE;
    else process.env.SVELTY_FAST_LANE = savedFlag;
  });

  it("classifies every pipeline hook declared in hooks.server.ts", () => {
    const declared = new Set(
      Array.from(hooksServerSource.matchAll(/wrapHandle\("([^"]+)"/g), (m) => m[1]),
    );
    // A regex that stops matching would make this guard vacuous.
    expect(declared.size).toBeGreaterThan(5);
    expect(Array.from(declared).filter((name) => !LANE_BYPASSED_HOOKS.has(name))).toEqual([]);
  });

  it("installs the dispatcher by default and installs nothing when opted out", () => {
    delete process.env.SVELTY_FAST_LANE;
    installFastLanes();
    expect(typeof (globalThis as RegistryHost)[FAST_LANE_REGISTRY]).toBe("function");

    delete (globalThis as RegistryHost)[FAST_LANE_REGISTRY];
    process.env.SVELTY_FAST_LANE = "0";
    installFastLanes();
    expect((globalThis as RegistryHost)[FAST_LANE_REGISTRY]).toBeUndefined();
  });

  it("serves only in operational states", () => {
    for (const state of ["READY", "WARMED", "WARMING", "DEGRADED"] as const) {
      setSystemState(state);
      expect(isLaneServingAllowed(), state).toBe(true);
    }
    for (const state of [
      "SETUP",
      "IDLE",
      "INITIALIZING",
      "MAINTENANCE",
      "RECOVERY",
      "FAILED",
    ] as const) {
      setSystemState(state);
      expect(isLaneServingAllowed(), state).toBe(false);
    }
  });

  it("publishes a dispatcher that declines when every lane declines", async () => {
    process.env.SVELTY_FAST_LANE = "1";
    registerFastLane(async () => null);
    installFastLanes();

    const dispatch = (globalThis as RegistryHost)[FAST_LANE_REGISTRY];
    expect(typeof dispatch).toBe("function");
    await expect(dispatch?.(laneInput)).resolves.toBeNull();
  });

  it("falls back instead of propagating a lane error", async () => {
    process.env.SVELTY_FAST_LANE = "1";
    registerFastLane(async () => {
      throw new Error("lane exploded");
    });
    installFastLanes();

    const dispatch = (globalThis as RegistryHost)[FAST_LANE_REGISTRY];
    await expect(dispatch?.(laneInput)).resolves.toBeNull();
  });

  // Registered last on purpose: `lanes` is module state with no unregister API,
  // so a serving lane added earlier would mask the decline behaviour above.
  it("refuses to serve while the instance is not operational", async () => {
    process.env.SVELTY_FAST_LANE = "1";
    registerFastLane(async () => ({
      status: 200,
      headers: { "content-type": "application/json" },
      body: "{}",
    }));
    installFastLanes();
    const dispatch = (globalThis as RegistryHost)[FAST_LANE_REGISTRY];

    setSystemState("MAINTENANCE");
    await expect(dispatch?.(laneInput)).resolves.toBeNull();

    setSystemState("READY");
    await expect(dispatch?.(laneInput)).resolves.toMatchObject({ status: 200 });
  });
});
