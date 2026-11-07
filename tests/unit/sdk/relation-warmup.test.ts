/**
 * @file tests/unit/sdk/relation-warmup.test.ts
 * @description Pins the deferred, privileged-only relation cache warm-up.
 *
 * `scheduleRelationWarmup` exists so a detail read can leave the entry editor's
 * relation pickers L1-hot without changing the response: the pass is deferred
 * past the read, capped, and skipped for callers whose target reads are
 * policy-clamped (the resolver never shares that cache for them).
 *
 * ### Features:
 * - admin/system gating: an unprivileged caller never reaches `findMany`
 * - warm-only semantics: `attach: false` leaves the item without `_populated_*`
 * - caps: at most 4 declared relation fields and 50 unique ids per pass
 * - no relation values ⇒ no deferred pass at all
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scheduleRelationWarmup } from "@src/services/sdk/namespaces/populate-resolver";
import { cacheService } from "@src/databases/cache/cache-service";

const ADMIN = { _id: "admin-1", role: "admin" };
const EDITOR = { _id: "editor-1", role: "editor" };
const identityName = (id: string) => id;

const postsSchema = {
  _id: "posts",
  name: "posts",
  fields: [
    { name: "author", relation: "authors" },
    { name: "tags", relation: "tags" },
  ],
};

interface WarmupQuery {
  _id: { $in: string[] };
}

/** Stub adapter: echoes the requested ids back as rows, one call per collection. */
function stubAdapter() {
  const findMany = vi.fn(async (_collection: string, query: WarmupQuery) => ({
    success: true,
    data: query._id.$in.map((id) => ({ _id: id })),
  }));
  return { findMany, adapter: { crud: { findMany } } };
}

/** Let the deferred `setTimeout(…, 0)` pass and its promise chain settle. */
async function flushWarmup(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(cacheService.getSync).mockReturnValue(null);
  vi.mocked(cacheService.getMany).mockImplementation(async (keys: string[]) =>
    keys.map(() => null),
  );
  vi.mocked(cacheService.setSync).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("scheduleRelationWarmup", () => {
  it("warms each target collection once and leaves the row unpopulated", async () => {
    const { findMany, adapter } = stubAdapter();
    const item: Record<string, unknown> = { _id: "p1", author: "u1", tags: ["t1", "t2"] };

    scheduleRelationWarmup([item], postsSchema, "t1", adapter, identityName, { user: ADMIN });
    await flushWarmup();

    expect(findMany).toHaveBeenCalledTimes(2);
    expect(findMany.mock.calls.map(([collection]) => collection)).toEqual(["authors", "tags"]);
    expect(findMany.mock.calls[0][1]).toEqual({ _id: { $in: ["u1"] } });
    expect(findMany.mock.calls[1][1]).toEqual({ _id: { $in: ["t1", "t2"] } });
    expect(vi.mocked(cacheService.setSync)).toHaveBeenCalledTimes(3);
    expect(Object.keys(item).some((key) => key.startsWith("_populated_"))).toBe(false);
  });

  it("does not warm for an unprivileged caller", async () => {
    const { findMany, adapter } = stubAdapter();

    scheduleRelationWarmup(
      [{ _id: "p1", author: "u1", tags: ["t1"] }],
      postsSchema,
      "t1",
      adapter,
      identityName,
      { user: EDITOR },
    );
    await flushWarmup();

    expect(findMany).not.toHaveBeenCalled();
  });

  it("warms for a system caller", async () => {
    const { findMany, adapter } = stubAdapter();

    scheduleRelationWarmup(
      [{ _id: "p1", author: "u1" }],
      postsSchema,
      "t1",
      adapter,
      identityName,
      { system: true },
    );
    await flushWarmup();

    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it("caps the pass at four declared relation fields", async () => {
    const { findMany, adapter } = stubAdapter();
    const schema = {
      _id: "posts",
      name: "posts",
      fields: Array.from({ length: 6 }, (_, index) => ({
        name: `rel${index + 1}`,
        relation: `target${index + 1}`,
      })),
    };
    const item = {
      _id: "p1",
      rel1: "a",
      rel2: "b",
      rel3: "c",
      rel4: "d",
      rel5: "e",
      rel6: "f",
    };

    scheduleRelationWarmup([item], schema, "t1", adapter, identityName, { user: ADMIN });
    await flushWarmup();

    expect(findMany.mock.calls.map(([collection]) => collection)).toEqual([
      "target1",
      "target2",
      "target3",
      "target4",
    ]);
  });

  it("caps collected ids at fifty per pass", async () => {
    const { findMany, adapter } = stubAdapter();
    const ids = Array.from({ length: 60 }, (_, index) => `t${index + 1}`);

    scheduleRelationWarmup([{ _id: "p1", tags: ids }], postsSchema, "t1", adapter, identityName, {
      user: ADMIN,
    });
    await flushWarmup();

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][1]._id.$in).toHaveLength(50);
    expect(vi.mocked(cacheService.setSync)).toHaveBeenCalledTimes(50);
  });

  it("does nothing when the row has no relation values", async () => {
    const { findMany, adapter } = stubAdapter();

    scheduleRelationWarmup(
      [{ _id: "p1", title: "Draft" }],
      postsSchema,
      "t1",
      adapter,
      identityName,
      { user: ADMIN },
    );
    await flushWarmup();

    expect(findMany).not.toHaveBeenCalled();
  });

  it("reads declared fields through db_fieldName", async () => {
    const { findMany, adapter } = stubAdapter();
    const schema = {
      _id: "posts",
      name: "posts",
      fields: [{ name: "author", db_fieldName: "author_ref", relation: "authors" }],
    };

    scheduleRelationWarmup([{ _id: "p1", author_ref: "u1" }], schema, "t1", adapter, identityName, {
      user: ADMIN,
    });
    await flushWarmup();

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][1]).toEqual({ _id: { $in: ["u1"] } });
  });

  it("does nothing for an empty item list", async () => {
    const { findMany, adapter } = stubAdapter();

    scheduleRelationWarmup([], postsSchema, "t1", adapter, identityName, { user: ADMIN });
    await flushWarmup();

    expect(findMany).not.toHaveBeenCalled();
  });
});
