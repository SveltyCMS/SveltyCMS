/**
 * @file tests/unit/sdk/list-warm.test.ts
 * @description Unit tests for the prediction-driven default-list warmer
 * (src/services/sdk/namespaces/collections/list-warm.ts): learner gating,
 * rate limiting, system-write exclusion and fire-and-forget semantics.
 *
 * The behavioral learner is the REAL module (no mocking): heat is recorded
 * via recordWriteAccess/recordCollectionAccess, exactly as the write path
 * does, so the hot-check integration is exercised end to end.
 *
 * Features:
 * - Skips system/internal actors and unknown tenants
 * - Warms only learner-hot collections (score > MIN_HOT_SCORE)
 * - Rate limit: one warm per collection per 5s window
 * - Failures are swallowed into a debug log (no unhandled rejections)
 * - SVELTY_DISABLE_LIST_WARM=1 kill switch
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  resetListWarmState,
  scheduleDefaultListWarm,
} from "@src/services/sdk/namespaces/collections/list-warm";
import {
  clearBehavioralData,
  recordWriteAccess,
} from "@src/services/intelligence/behavioral-learner";

const USER = { _id: "user-1", role: "admin", username: "bench" };
const TENANT = "warm-tenant";

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeRecorder() {
  const calls: Array<{ tenantId: unknown; user: unknown }> = [];
  const runFind = async (opts: { tenantId: unknown; user: unknown }): Promise<unknown> => {
    calls.push(opts);
    return { success: true, data: [] };
  };
  return { calls, runFind };
}

describe("scheduleDefaultListWarm", () => {
  beforeEach(() => {
    resetListWarmState();
    clearBehavioralData();
  });

  afterEach(() => {
    resetListWarmState();
    clearBehavioralData();
    delete process.env.SVELTY_DISABLE_LIST_WARM;
  });

  it("skips system actors", async () => {
    const { calls, runFind } = makeRecorder();
    scheduleDefaultListWarm("posts", TENANT, { _id: "system", role: "admin" }, runFind);
    await flushMicrotasks();
    expect(calls).toHaveLength(0);
  });

  it("does not warm collections the learner does not consider hot", async () => {
    const { calls, runFind } = makeRecorder();
    // No heat recorded for this tenant/collection.
    scheduleDefaultListWarm("cold-collection", TENANT, USER, runFind);
    await flushMicrotasks();
    expect(calls).toHaveLength(0);
  });

  it("warms a learner-hot collection with the writer's tenant and actor", async () => {
    recordWriteAccess(TENANT, "posts", "entry-1");
    const { calls, runFind } = makeRecorder();
    scheduleDefaultListWarm("posts", TENANT, USER, runFind);
    await flushMicrotasks();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ tenantId: TENANT, user: USER });
  });

  it("rate-limits to one warm per collection per window", async () => {
    recordWriteAccess(TENANT, "posts", "entry-1");
    const { calls, runFind } = makeRecorder();
    scheduleDefaultListWarm("posts", TENANT, USER, runFind);
    scheduleDefaultListWarm("posts", TENANT, USER, runFind);
    await flushMicrotasks();
    expect(calls).toHaveLength(1);
  });

  it("allows a new warm after the rate-limit state is reset", async () => {
    recordWriteAccess(TENANT, "posts", "entry-1");
    const { calls, runFind } = makeRecorder();
    scheduleDefaultListWarm("posts", TENANT, USER, runFind);
    await flushMicrotasks();
    expect(calls).toHaveLength(1);
    resetListWarmState();
    scheduleDefaultListWarm("posts", TENANT, USER, runFind);
    await flushMicrotasks();
    expect(calls).toHaveLength(2);
  });

  it("keeps distinct collections on independent rate-limit clocks", async () => {
    recordWriteAccess(TENANT, "posts", "e1");
    recordWriteAccess(TENANT, "pages", "e2");
    const { calls, runFind } = makeRecorder();
    scheduleDefaultListWarm("posts", TENANT, USER, runFind);
    scheduleDefaultListWarm("pages", TENANT, USER, runFind);
    await flushMicrotasks();
    expect(calls).toHaveLength(2);
  });

  it("swallows warm failures (no unhandled rejection)", async () => {
    recordWriteAccess(TENANT, "posts", "entry-1");
    let calls = 0;
    const failingFind = async (): Promise<unknown> => {
      calls += 1;
      throw new Error("db down");
    };
    scheduleDefaultListWarm("posts", TENANT, USER, failingFind);
    await flushMicrotasks();
    expect(calls).toBe(1);
  });

  it("respects the SVELTY_DISABLE_LIST_WARM kill switch", async () => {
    recordWriteAccess(TENANT, "posts", "entry-1");
    process.env.SVELTY_DISABLE_LIST_WARM = "1";
    const { calls, runFind } = makeRecorder();
    scheduleDefaultListWarm("posts", TENANT, USER, runFind);
    await flushMicrotasks();
    expect(calls).toHaveLength(0);
  });
});
