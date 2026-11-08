/**
 * @file tests/unit/sdk/populate-policy.test.ts
 * @description Pins the caller policy applied to populated relation targets.
 *
 * A relation is a read bypass if the parent query is scoped/redacted but the
 * target fetch is a bare `_id $in`: drafts, foreign-tenant rows and private
 * fields would ride along under `_populated_*`. `populate-resolver.ts` closes
 * that by applying the caller's publication filter/ownership to the target
 * query and redacting each target row with the TARGET schema's field policy.
 *
 * ### Features:
 * - guarded target fields are redacted for a non-admin, kept for an admin
 * - the fetched row stays raw (the shared L1/L2 cache must never hold redacted data)
 * - a non-privileged caller's target query carries `status: "publish"`
 * - a clamped caller does not read the shared relation cache at all
 * - an unclamped read warms L1+L2 per row without awaiting the L2 write
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FieldInstance } from "@src/content/types";
import { resolvePopulatedRelations } from "@src/services/sdk/namespaces/populate-resolver";
import { cacheService } from "@src/databases/cache/cache-service";
import { CacheCategory } from "@src/databases/cache/types";

const name: FieldInstance = {
  db_fieldName: "name",
  name: "name",
  label: "Name",
  type: "text",
} as unknown as FieldInstance;

/** Guarded exactly like the nested-field tests: private, admin-readable only. */
const ssn: FieldInstance = {
  db_fieldName: "ssn",
  name: "ssn",
  label: "SSN",
  type: "text",
  permissions: { visibility: "private", readRoles: ["admin"] },
} as unknown as FieldInstance;

const postsSchema = {
  _id: "posts",
  name: "posts",
  fields: [{ name: "author", relation: "authors" }],
};
const authorsSchema = { _id: "authors", name: "authors", fields: [name, ssn] };
const identityName = (id: string) => id;
const adapter = (findMany: unknown) => ({ crud: { findMany } });

function deferred<T = void>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.mocked(cacheService.getSync).mockReturnValue(null);
  vi.mocked(cacheService.getMany).mockImplementation(async (keys: string[]) =>
    keys.map(() => null),
  );
  vi.mocked(cacheService.set).mockReset();
  vi.mocked(cacheService.set).mockResolvedValue(undefined);
  vi.mocked(cacheService.setSync).mockClear();
});

describe("populate target policy", () => {
  it("redacts a guarded target field without mutating the fetched row", async () => {
    const raw = { _id: "a1", name: "A", ssn: "123-45-6789" };
    const findMany = vi.fn().mockResolvedValue({ success: true, data: [raw] });
    const items: Record<string, unknown>[] = [{ _id: "p1", author: "a1" }];

    await resolvePopulatedRelations(
      items,
      postsSchema,
      ["author"],
      "t1",
      adapter(findMany),
      identityName,
      {
        user: { _id: "u1", role: "editor" },
        resolveTargetSchema: async () => authorsSchema,
      },
    );

    expect(items[0]["_populated_author"]).toEqual({ _id: "a1", name: "A" });
    // The row handed to the shared cache keeps the privileged value.
    expect(raw.ssn).toBe("123-45-6789");
  });

  it("keeps the guarded field for an admin reader", async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue({ success: true, data: [{ _id: "a1", name: "A", ssn: "123" }] });
    const items: Record<string, unknown>[] = [{ _id: "p1", author: "a1" }];

    await resolvePopulatedRelations(
      items,
      postsSchema,
      ["author"],
      "t1",
      adapter(findMany),
      identityName,
      {
        user: { _id: "a1", role: "admin" },
        resolveTargetSchema: async () => authorsSchema,
      },
    );

    expect((items[0]["_populated_author"] as Record<string, unknown>).ssn).toBe("123");
  });

  it("clamps the target query to published rows for a non-privileged caller", async () => {
    const findMany = vi.fn().mockResolvedValue({ success: true, data: [] });
    const items: Record<string, unknown>[] = [{ _id: "p1", author: "a1" }];

    await resolvePopulatedRelations(
      items,
      postsSchema,
      ["author"],
      "t1",
      adapter(findMany),
      identityName,
      {
        user: { _id: "u1", role: "editor" },
        requestedPublicationFilter: "all",
        resolveTargetSchema: async () => authorsSchema,
      },
    );

    expect(findMany).toHaveBeenCalledWith(
      "authors",
      { _id: { $in: ["a1"] }, status: "publish" },
      expect.objectContaining({ limit: 1, tenantId: "t1" }),
    );
  });

  it("never reads the shared relation cache for a clamped caller", async () => {
    const findMany = vi.fn().mockResolvedValue({ success: true, data: [] });

    await resolvePopulatedRelations(
      [{ _id: "p1", author: "a1" }],
      postsSchema,
      ["author"],
      "t1",
      adapter(findMany),
      identityName,
      {
        user: { _id: "u1", role: "editor" },
        resolveTargetSchema: async () => authorsSchema,
      },
    );

    expect(vi.mocked(cacheService.getSync)).not.toHaveBeenCalled();
    expect(vi.mocked(cacheService.getMany)).not.toHaveBeenCalled();
  });

  it("warms L1 and L2 with the raw fetched row", async () => {
    const raw = { _id: "a1", name: "A" };
    const findMany = vi.fn().mockResolvedValue({ success: true, data: [raw] });

    await resolvePopulatedRelations(
      [{ _id: "p1", author: "a1" }],
      postsSchema,
      ["author"],
      "t1",
      adapter(findMany),
      identityName,
      {
        user: { _id: "a1", role: "admin" },
        resolveTargetSchema: async () => authorsSchema,
      },
    );

    expect(vi.mocked(cacheService.setSync)).not.toHaveBeenCalled();
    expect(vi.mocked(cacheService.set)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(cacheService.set)).toHaveBeenCalledWith(
      "t1:collection:authors:a1",
      { success: true, data: raw },
      180,
      "t1",
      CacheCategory.ENTRY,
      ["doc:authors:a1"],
    );
  });

  it("resolves the read when the background cache write rejects", async () => {
    const findMany = vi.fn().mockResolvedValue({ success: true, data: [{ _id: "a1", name: "A" }] });
    vi.mocked(cacheService.set).mockRejectedValue(new Error("redis unavailable"));
    const items: Record<string, unknown>[] = [{ _id: "p1", author: "a1" }];

    await expect(
      resolvePopulatedRelations(
        items,
        postsSchema,
        ["author"],
        "t1",
        adapter(findMany),
        identityName,
        {
          user: { _id: "a1", role: "admin" },
          resolveTargetSchema: async () => authorsSchema,
        },
      ),
    ).resolves.toBeUndefined();

    expect(vi.mocked(cacheService.set)).toHaveBeenCalledTimes(1);
    expect(items[0]["_populated_author"]).toEqual({ _id: "a1", name: "A" });
  });

  it("resolves the read before the background L2 write settles", async () => {
    const pending = deferred();
    vi.mocked(cacheService.set).mockReturnValue(pending.promise);
    const findMany = vi.fn().mockResolvedValue({ success: true, data: [{ _id: "a1", name: "A" }] });
    const items: Record<string, unknown>[] = [{ _id: "p1", author: "a1" }];

    let writeSettled = false;
    void pending.promise.then(() => {
      writeSettled = true;
    });

    // If the resolver awaited `set`, this await would never return.
    await resolvePopulatedRelations(
      items,
      postsSchema,
      ["author"],
      "t1",
      adapter(findMany),
      identityName,
      {
        user: { _id: "a1", role: "admin" },
        resolveTargetSchema: async () => authorsSchema,
      },
    );

    expect(vi.mocked(cacheService.set)).toHaveBeenCalledTimes(1);
    expect(writeSettled).toBe(false);
    expect(items[0]["_populated_author"]).toEqual({ _id: "a1", name: "A" });

    pending.resolve();
    await pending.promise;
  });
});
