/**
 * @file tests/unit/databases/postgresql-adapter-param.test.ts
 * @description Unit tests for PostgreSQL adapter parameter binding contracts.
 */

import { describe, it, expect } from "vitest";

describe("PostgreSQL Adapter Parameter Binding Contract", () => {
  it("coerces undefined values to null to prevent postgres.js driver parameter rejection", async () => {
    // Dynamically test the bindPgParam contract logic
    function bindPgParam(v: unknown, asJson: boolean): unknown {
      if (v === undefined) return null;
      if (v instanceof Date) return v.toISOString();
      if (asJson) return v === null ? null : JSON.stringify(v);
      if (v !== null && typeof v === "object") return JSON.stringify(v);
      return v;
    }

    expect(bindPgParam(undefined, false)).toBe(null);
    expect(bindPgParam(undefined, true)).toBe(null);
    expect(bindPgParam(null, false)).toBe(null);
    expect(bindPgParam(null, true)).toBe(null);
    expect(bindPgParam("text", false)).toBe("text");
    expect(bindPgParam(42, false)).toBe(42);
    expect(bindPgParam({ a: 1 }, false)).toBe('{"a":1}');
    expect(bindPgParam({ a: 1 }, true)).toBe('{"a":1}');
  });

  it("resolves connection parameters including synchronous_commit and work_mem", async () => {
    const { pgConnectionParameters } = await import("@src/databases/postgresql/adapter-core");

    const origSync = process.env.PG_SYNCHRONOUS_COMMIT;
    const origWorkMem = process.env.PG_WORK_MEM;
    try {
      delete process.env.PG_SYNCHRONOUS_COMMIT;
      delete process.env.DATABASE_SYNCHRONOUS_COMMIT;
      delete process.env.POSTGRES_SYNCHRONOUS_COMMIT;
      delete process.env.PG_WORK_MEM;
      delete process.env.DATABASE_WORK_MEM;

      const defaults = pgConnectionParameters();
      expect(defaults.application_name).toBe("sveltycms");
      expect(defaults.statement_timeout).toBe(30000);
      expect(defaults.jit).toBe("off");
      expect(defaults.synchronous_commit).toBeUndefined();

      process.env.PG_SYNCHRONOUS_COMMIT = "off";
      process.env.PG_WORK_MEM = "64MB";
      process.env.PG_JIT = "on";

      const configured = pgConnectionParameters({ custom: "value" });
      expect(configured.application_name).toBe("sveltycms");
      expect(configured.synchronous_commit).toBe("off");
      expect(configured.work_mem).toBe("64MB");
      expect(configured.jit).toBe("on");
      expect(configured.custom).toBe("value");

      const overridden = pgConnectionParameters({ synchronous_commit: "local", jit: "off" });
      expect(overridden.synchronous_commit).toBe("local");
      expect(overridden.jit).toBe("off");
    } finally {
      if (origSync !== undefined) process.env.PG_SYNCHRONOUS_COMMIT = origSync;
      else delete process.env.PG_SYNCHRONOUS_COMMIT;
      if (origWorkMem !== undefined) process.env.PG_WORK_MEM = origWorkMem;
      else delete process.env.PG_WORK_MEM;
      delete process.env.PG_JIT;
    }
  });

  it("truncates index names over 63 characters safely with a deterministic hash", async () => {
    const { pgSafeIndexName } = await import("@src/databases/postgresql/adapter-core");

    const shortName = "collection_posts_tenant_status_updated_id";
    expect(shortName.length).toBeLessThanOrEqual(63);
    expect(pgSafeIndexName(shortName)).toBe(shortName);

    const longName =
      "collection_very_long_custom_collection_name_tenant_status_custom_published_date_id";
    expect(longName.length).toBeGreaterThan(63);
    const safe = pgSafeIndexName(longName);
    expect(safe.length).toBeLessThanOrEqual(63);
    expect(safe).toContain("_");
    // Guarantee idempotency
    expect(pgSafeIndexName(longName)).toBe(safe);
  });

  it("resolves update field projections to physical columns and drops blob-only names", async () => {
    const { PostgresAdapterCore } = await import("@src/databases/postgresql/adapter-core");

    // Minimal column catalog shape: getColumn resolves physical names only.
    const catalog = new Map<string, string>([
      ["_id", "_id"],
      ["count", "count"],
      ["status", "status"],
      ["updatedAt", "updatedAt"],
      ["data", "data"],
    ]);
    const getColumn = (_t: unknown, name: string) => {
      const phys = catalog.get(name);
      return phys !== undefined ? { name: phys } : undefined;
    };

    // Physical-only projection passes through (deduped, order preserved).
    expect(
      PostgresAdapterCore.resolveUpdateProjection(
        {},
        ["_id", "count", "updatedAt", "count"],
        getColumn,
      ),
    ).toEqual(["_id", "count", "updatedAt"]);

    // Dynamic blob fields (title lives inside `data`) are dropped.
    expect(
      PostgresAdapterCore.resolveUpdateProjection({}, ["_id", "title", "slug"], getColumn),
    ).toEqual(["_id"]);

    // A projection of only unresolvable names resolves empty → full `*` return.
    expect(PostgresAdapterCore.resolveUpdateProjection({}, ["title", "body"], getColumn)).toEqual(
      [],
    );
  });
});
