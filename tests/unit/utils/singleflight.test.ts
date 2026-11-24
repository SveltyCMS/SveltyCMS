/**
 * @file tests/unit/utils/singleflight.test.ts
 * @description Unit tests for in-process singleflight coalescing.
 */

import { describe, expect, it } from "vitest";
import { SingleflightGroup } from "../../../src/utils/singleflight";

describe("SingleflightGroup", () => {
  it("coalesces concurrent calls with the same key", async () => {
    const group = new SingleflightGroup<string>();
    let calls = 0;

    const fn = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 15));
      return "value";
    };

    const [a, b, c] = await Promise.all([
      group.do("k1", fn),
      group.do("k1", fn),
      group.do("k1", fn),
    ]);

    expect(a).toBe("value");
    expect(b).toBe("value");
    expect(c).toBe("value");
    expect(calls).toBe(1);
    expect(group.coalescedCount).toBe(2);
    expect(group.inFlightCount).toBe(0);
  });

  it("cleans up in-flight map on rejection", async () => {
    const group = new SingleflightGroup<string>();
    await expect(
      group.do("err", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(group.inFlightCount).toBe(0);
  });
});
