/**
 * @file tests/unit/hooks/fast-lane-policy.test.ts
 * @description Guard for the fast-lane bypass policy: every pipeline hook
 * declared in `hooks.server.ts` must be classified, so a hook added later cannot
 * silently miss lane traffic. Also pins the default-off registry behaviour.
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

const hooksServerSource = readFileSync(join(process.cwd(), "src", "hooks.server.ts"), "utf8");

type RegistryHost = typeof globalThis & {
  [FAST_LANE_REGISTRY]?: (input: unknown) => Promise<unknown>;
};

describe("fast-lane bypass policy", () => {
  const savedFlag = process.env.SVELTY_FAST_LANE;

  beforeEach(() => {
    delete (globalThis as RegistryHost)[FAST_LANE_REGISTRY];
  });

  afterEach(() => {
    delete (globalThis as RegistryHost)[FAST_LANE_REGISTRY];
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

  it("installs nothing while SVELTY_FAST_LANE is unset", () => {
    delete process.env.SVELTY_FAST_LANE;
    installFastLanes();
    expect((globalThis as RegistryHost)[FAST_LANE_REGISTRY]).toBeUndefined();
  });

  it("publishes a dispatcher that declines when every lane declines", async () => {
    process.env.SVELTY_FAST_LANE = "1";
    registerFastLane(async () => null);
    installFastLanes();

    const dispatch = (globalThis as RegistryHost)[FAST_LANE_REGISTRY];
    expect(typeof dispatch).toBe("function");
    await expect(
      dispatch?.({
        method: "GET",
        url: "/api/collections/articles/abc",
        origin: "http://127.0.0.1",
        headers: {},
      }),
    ).resolves.toBeNull();
  });

  it("falls back instead of propagating a lane error", async () => {
    process.env.SVELTY_FAST_LANE = "1";
    registerFastLane(async () => {
      throw new Error("lane exploded");
    });
    installFastLanes();

    const dispatch = (globalThis as RegistryHost)[FAST_LANE_REGISTRY];
    await expect(
      dispatch?.({
        method: "GET",
        url: "/api/collections/articles/abc",
        origin: "http://127.0.0.1",
        headers: {},
      }),
    ).resolves.toBeNull();
  });
});
