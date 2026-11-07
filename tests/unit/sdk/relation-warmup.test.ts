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
 * - the background L2 write is never awaited and cannot fail the pass
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scheduleRelationWarmup } from "@src/services/sdk/namespaces/populate-resolver";
import { cacheService } from "@src/databases/cache/cache-service";
import { CacheCategory } from "@src/databases/cache/types";

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

function deferred<T = void>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(cacheService.getSync).mockReturnValue(null);
  vi.mocked(cacheService.getMany).mockImplementation(async (keys: string[]) =>
    keys.map(() => null),
  );
  vi.mocked(cacheService.set).mockReset();
  vi.mocked(cacheService.set).mockResolvedValue(undefined);
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
    // One L1+L2 `set` per fetched row — never the L1-only `setSync`.
    expect(vi.mocked(cacheService.setSync)).not.toHaveBeenCalled();
    expect(vi.mocked(cacheService.set).mock.calls).toEqual([
      [
        "t1:collection:authors:u1",
        { success: true, data: { _id: "u1" } },
        180,
        "t1",
        CacheCategory.ENTRY,
        ["doc:authors:u1"],
      ],
      [
        "t1:collection:tags:t1",
        { success: true, data: { _id: "t1" } },
        180,
        "t1",
        CacheCategory.ENTRY,
        ["doc:tags:t1"],
      ],
      [
        "t1:collection:tags:t2",
        { success: true, data: { _id: "t2" } },
        180,
        "t1",
        CacheCategory.ENTRY,
        ["doc:tags:t2"],
      ],
    ]);
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
    expect(vi.mocked(cacheService.set)).toHaveBeenCalledTimes(50);
  });

  it("keeps warming other rows when the background cache write rejects", async () => {
    const { findMany, adapter } = stubAdapter();
    vi.mocked(cacheService.set).mockRejectedValue(new Error("redis unavailable"));

    scheduleRelationWarmup(
      [{ _id: "p1", author: "u1", tags: ["t1", "t2"] }],
      postsSchema,
      "t1",
      adapter,
      identityName,
      { user: ADMIN },
    );
    await flushWarmup();

    // The rejection is swallowed by the background handler, so the pass still
    // writes every fetched row.
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(vi.mocked(cacheService.set)).toHaveBeenCalledTimes(3);
  });

  it("does not await the background cache write", async () => {
    const { findMany, adapter } = stubAdapter();
    const pending = deferred();
    vi.mocked(cacheService.set).mockReturnValue(pending.promise);

    scheduleRelationWarmup(
      [{ _id: "p1", tags: ["t1", "t2"] }],
      postsSchema,
      "t1",
      adapter,
      identityName,
      { user: ADMIN },
    );
    await flushWarmup();

    // Both ids were warmed although the first write is still unresolved — an
    // awaited `set` would have stalled the loop after the first id.
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(vi.mocked(cacheService.set)).toHaveBeenCalledTimes(2);

    pending.resolve();
    await pending.promise;
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
