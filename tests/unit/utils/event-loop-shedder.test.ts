/**
 * @file tests/unit/utils/event-loop-shedder.test.ts
 * @description Unit tests for event-loop-lag adaptive load shedding.
 */

import { describe, expect, it } from "vitest";
import { EventLoopShedder } from "@utils/event-loop-shedder";

describe("EventLoopShedder", () => {
  it("sheds low-priority traffic above threshold while preserving high/normal", () => {
    const shedder = new EventLoopShedder({ lagThresholdMs: 50, retryAfterSeconds: 3 });

    shedder.recordLagSample(10);
    expect(shedder.isOverloaded).toBe(false);
    expect(shedder.shouldShed("low")).toBe(false);
    expect(shedder.shouldShed("normal")).toBe(false);
    expect(shedder.shouldShed("high")).toBe(false);

    shedder.recordLagSample(65);
    expect(shedder.isOverloaded).toBe(true);
    expect(shedder.shouldShed("low")).toBe(true);
    expect(shedder.shouldShed("normal")).toBe(false);
    expect(shedder.shouldShed("high")).toBe(false);

    const res = shedder.createShedResponse();
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("3");
  });
});
