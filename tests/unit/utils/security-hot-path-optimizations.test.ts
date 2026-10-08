/**
 * @file tests/unit/utils/security-hot-path-optimizations.test.ts
 * @description Regression tests for the mechanical per-request optimizations in
 * src/utils/security (publication-policy, mongo-sanitize, permission-cache,
 * safe-query). Locks the observable behavior the optimizations must preserve:
 * error codes/paths, key equivalence, reference identity, and out-of-type
 * input handling. No timing assertions — throughput is owned by the central
 * benchmark run (tests/benchmarks/security-utils.test.ts).
 */

import { describe, it, expect, afterEach } from "vitest";
import { publicationCacheSuffix } from "@src/utils/security/publication-policy";
import { sanitizeMongoQuery } from "@src/utils/security/mongo-sanitize";
import { permissionCache } from "@src/utils/security/permission-cache";
import { AppError } from "@utils/error-handling";
import { safeQuery } from "@src/utils/security/safe-query";

describe("publicationCacheSuffix — precomputed lookup keeps byte-identical output", () => {
  it("returns the precomputed suffixes for typed filters", () => {
    expect(publicationCacheSuffix("all")).toBe("");
    expect(publicationCacheSuffix("published")).toBe(":published");
    expect(publicationCacheSuffix("draft")).toBe(":draft");
  });

  it("keeps the template fallback for out-of-type inputs", () => {
    expect(publicationCacheSuffix("bogus" as never)).toBe(":bogus");
  });
});

describe("sanitizeMongoQuery — lazy path building preserves sanitizer semantics", () => {
  const CLEAN_QUERY = {
    $or: [{ status: "publish" }, { "meta.seo.indexed": true }],
    "user.email": { $ne: "" },
    title: { $regex: "^hello", $options: "i" },
    tags: { $in: ["news", "tech"] },
    meta: { views: { $gte: 10 }, nested: { deep: { value: 1 } } },
  };

  it("passes clean nested queries through unchanged (in-place mutation contract)", () => {
    const snapshot = JSON.parse(JSON.stringify(CLEAN_QUERY));
    const result = sanitizeMongoQuery(snapshot);
    expect(result).toBe(snapshot); // same reference: in-place walk
    expect(snapshot).toEqual(CLEAN_QUERY);
  });

  it("still detects blocked operators nested inside array elements", () => {
    let caught: AppError | null = null;
    try {
      sanitizeMongoQuery({ tags: [{ $expr: 1 }] });
    } catch (err) {
      caught = err as AppError;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect(caught?.code).toBe("NOSQL_INJECTION_BLOCKED");
  });

  it("still detects blocked operators at deep object paths", () => {
    let caught: AppError | null = null;
    try {
      sanitizeMongoQuery({ meta: { title: { $where: "this.secret === true" } } });
    } catch (err) {
      caught = err as AppError;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect(caught?.code).toBe("NOSQL_INJECTION_BLOCKED");
  });

  it("still enforces the $regex length cap on nested regex values", () => {
    let caught: AppError | null = null;
    try {
      sanitizeMongoQuery({ title: { $regex: "a".repeat(501) } });
    } catch (err) {
      caught = err as AppError;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect(caught?.code).toBe("REGEX_TOO_LONG");
  });
});

describe("permissionCache — identity-memoized role segment keeps key semantics", () => {
  const USER_A = "hot-path-user-a";
  const USER_B = "hot-path-user-b";
  const PERMISSION = "content:read";

  afterEach(() => {
    permissionCache.invalidateAll();
  });

  it("treats differently ordered role arrays as the same key (sort preserved)", () => {
    permissionCache.set(USER_A, PERMISSION, ["editor", "author"], true);
    expect(permissionCache.get(USER_A, PERMISSION, ["author", "editor"])).toBe(true);
    expect(permissionCache.get(USER_A, PERMISSION, ["editor", "author"])).toBe(true);
  });

  it("hits the cache across repeated calls with the same roleIds array instance", () => {
    const roles = ["editor", "author"];
    expect(permissionCache.get(USER_A, PERMISSION, roles)).toBeNull();
    permissionCache.set(USER_A, PERMISSION, roles, true);
    expect(permissionCache.get(USER_A, PERMISSION, roles)).toBe(true);
    expect(permissionCache.get(USER_A, PERMISSION, roles)).toBe(true);
  });

  it("supports empty and single-role arrays (trivial sort shortcuts)", () => {
    permissionCache.set(USER_A, "empty:roles", [], true);
    expect(permissionCache.get(USER_A, "empty:roles", [])).toBe(true);

    permissionCache.set(USER_A, "single:role", ["admin"], false);
    expect(permissionCache.get(USER_A, "single:role", ["admin"])).toBe(false);
  });

  it("keeps results isolated per user and per permission", () => {
    const roles = ["editor", "author"];
    permissionCache.set(USER_A, PERMISSION, roles, true);
    permissionCache.set(USER_B, PERMISSION, roles, false);
    permissionCache.set(USER_A, "other:permission", roles, false);
    expect(permissionCache.get(USER_A, PERMISSION, roles)).toBe(true);
    expect(permissionCache.get(USER_B, PERMISSION, roles)).toBe(false);
    expect(permissionCache.get(USER_A, "other:permission", roles)).toBe(false);
  });

  it("invalidateUser still drops only the targeted user's entries", () => {
    const roles = ["editor", "author"];
    permissionCache.set(USER_A, PERMISSION, roles, true);
    permissionCache.set(USER_B, PERMISSION, roles, true);
    permissionCache.invalidateUser(USER_A);
    expect(permissionCache.get(USER_A, PERMISSION, roles)).toBeNull();
    expect(permissionCache.get(USER_B, PERMISSION, roles)).toBe(true);
  });
});

describe("safeQuery — reordered tenant merge keeps reference identity", () => {
  it("returns the caller's object unchanged when already scoped and filtered", () => {
    const query = { path: "/docs/a", tenantId: "t-1", isDeleted: { $ne: true } };
    expect(safeQuery(query, "t-1", {})).toBe(query);
  });

  it("still injects the tenant scope for unscoped queries", () => {
    const query: Record<string, unknown> = { path: "/docs/a" };
    const result = safeQuery(query, "t-1", {}) as Record<string, unknown>;
    expect(result.tenantId).toBe("t-1");
    expect(result.isDeleted).toEqual({ $ne: true });
  });
});
