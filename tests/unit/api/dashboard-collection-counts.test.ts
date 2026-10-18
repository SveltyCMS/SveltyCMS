/**
 * @file tests/unit/api/dashboard-collection-counts.test.ts
 * @description Dashboard analytics counts collections concurrently, not N+1.
 *
 * Features:
 * - every count starts before the first one resolves (parallel dispatch)
 * - failed/throwing collections contribute 0 instead of breaking the total
 * - entries without an id/name are skipped
 */

import { describe, expect, it, vi } from "vitest";
import { countCollectionEntries } from "../../../src/routes/api/[...path]/handlers/dashboard";

describe("countCollectionEntries", () => {
  it("dispatches every count concurrently instead of awaiting one by one", async () => {
    let started = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const countOne = vi.fn(async () => {
      started++;
      await gate;
      return { success: true, data: 1 };
    });

    const pending = countCollectionEntries(countOne, [{ _id: "posts" }, { name: "pages" }]);

    // Each mapper runs synchronously up to its `await countOne(...)`.
    expect(countOne).toHaveBeenCalledTimes(2);
    expect(started).toBe(2);

    release();
    await expect(pending).resolves.toBe(2);
  });

  it("sums successful counts and treats failures as zero", async () => {
    const countOne = async (collection: string) => {
      if (collection === "throws") throw new Error("missing table");
      if (collection === "fails") return { success: false as const };
      return { success: true as const, data: collection === "posts" ? 7 : 3 };
    };

    await expect(
      countCollectionEntries(countOne, [
        { _id: "posts" },
        { _id: "pages" },
        { _id: "fails" },
        { _id: "throws" },
      ]),
    ).resolves.toBe(10);
  });

  it("skips entries without a usable collection name", async () => {
    const countOne = vi.fn(async () => ({ success: true as const, data: 1 }));

    await expect(countCollectionEntries(countOne, [{}, { _id: "" }, { _id: "ok" }])).resolves.toBe(
      1,
    );
    expect(countOne).toHaveBeenCalledTimes(1);
    expect(countOne).toHaveBeenCalledWith("ok");
  });

  it("does not touch the database for an empty collection list", async () => {
    const countOne = vi.fn(async () => ({ success: true as const, data: 1 }));
    await expect(countCollectionEntries(countOne, [])).resolves.toBe(0);
    expect(countOne).not.toHaveBeenCalled();
  });
});
