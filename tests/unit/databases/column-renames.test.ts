/**
 * @file tests/unit/databases/column-renames.test.ts
 * @description Unit tests for declared `renamedFrom` replay and exact string column types.
 *
 * Features tested:
 * - planColumnReconcile branch table (declared-case rename, skip cases)
 * - applyDeclaredFieldRenames: once-per-table dedup, actual-case catalog match, retry on failure
 * - applyMongoFieldRenames: once-per-model `$rename`, rename-free no-op
 * - materializedSqlType per dialect
 */
import { describe, expect, it, vi } from "vitest";
import {
  applyDeclaredFieldRenames,
  applyMongoFieldRenames,
  hasDeclaredFieldRename,
  materializedSqlType,
  planColumnReconcile,
} from "@src/databases/core/collection-module";

let tableCounter = 0;
const nextTableKey = (prefix: string) => `${prefix}:unit_${++tableCounter}`;

describe("planColumnReconcile", () => {
  it("plans a rename when the old column exists and the new one does not", () => {
    const have = new Set(["mfaverifiedat", "user_id", "expires"]);
    expect(
      planColumnReconcile(have, { name: "mfaVerified", renamedFrom: "mfaVerifiedAt" }),
    ).toEqual({
      action: "rename",
      from: "mfaVerifiedAt",
    });
  });

  it("skips when the declared rename is absent, self-referential, or unresolved", () => {
    const have = new Set(["oldname", "newname"]);
    expect(planColumnReconcile(have, { name: "newname" })).toEqual({ action: "skip" });
    expect(planColumnReconcile(have, { name: "newname", renamedFrom: "newname" })).toEqual({
      action: "skip",
    });
    // New column already present — nothing to rename.
    expect(planColumnReconcile(have, { name: "newname", renamedFrom: "oldname" })).toEqual({
      action: "skip",
    });
    // Old column absent — ADD (if needed) uses the new name.
    expect(planColumnReconcile(have, { name: "third", renamedFrom: "gone" })).toEqual({
      action: "skip",
    });
  });
});

describe("hasDeclaredFieldRename", () => {
  it("scans field arrays for a non-empty renamedFrom", () => {
    expect(hasDeclaredFieldRename([{ db_fieldName: "views" }])).toBe(false);
    expect(hasDeclaredFieldRename([{ db_fieldName: "views", renamedFrom: " " }])).toBe(false);
    expect(hasDeclaredFieldRename([{ db_fieldName: "views", renamedFrom: "oldViews" }])).toBe(true);
    expect(hasDeclaredFieldRename(undefined)).toBe(false);
    expect(hasDeclaredFieldRename("not-an-array")).toBe(false);
  });
});

describe("applyDeclaredFieldRenames", () => {
  it("renames the stored-case column once per table, then never rescans", async () => {
    const executed: string[] = [];
    const listColumns = vi.fn(async () => new Set(["Old_Views", "title"]));
    const options = {
      dialect: "postgresql" as const,
      tableKey: nextTableKey("pg"),
      physicalName: "collection_articles",
      fields: [{ db_fieldName: "views", renamedFrom: "Old_Views" }],
      listColumns,
      execute: async (sqlText: string) => {
        executed.push(sqlText);
      },
    };

    await applyDeclaredFieldRenames(options);
    expect(executed).toEqual([
      'ALTER TABLE "collection_articles" RENAME COLUMN "Old_Views" TO "views"',
    ]);

    await applyDeclaredFieldRenames(options);
    expect(listColumns).toHaveBeenCalledTimes(1);
    expect(executed).toHaveLength(1);
  });

  it("retries after a failed rename instead of marking the table resolved", async () => {
    let attempts = 0;
    const executed: string[] = [];
    const options = {
      dialect: "mariadb" as const,
      tableKey: nextTableKey("maria"),
      physicalName: "collection_articles",
      fields: [{ db_fieldName: "views", renamedFrom: "oldViews" }],
      listColumns: async () => new Set(["oldViews"]),
      execute: async (sqlText: string) => {
        attempts++;
        if (attempts === 1) throw new Error("connection reset");
        executed.push(sqlText);
      },
    };

    await applyDeclaredFieldRenames(options);
    expect(executed).toEqual([]);

    await applyDeclaredFieldRenames(options);
    expect(executed).toEqual([
      "ALTER TABLE `collection_articles` RENAME COLUMN `oldViews` TO `views`",
    ]);

    await applyDeclaredFieldRenames(options);
    expect(attempts).toBe(2);
  });

  it("keeps checking until the table exists (empty catalog is not resolved)", async () => {
    let present = false;
    const executed: string[] = [];
    const options = {
      dialect: "sqlite" as const,
      tableKey: nextTableKey("sqlite"),
      physicalName: "collection_articles",
      fields: [{ db_fieldName: "views", renamedFrom: "oldViews" }],
      listColumns: async () => (present ? new Set(["oldViews"]) : new Set<string>()),
      execute: async (sqlText: string) => {
        executed.push(sqlText);
      },
    };

    await applyDeclaredFieldRenames(options);
    expect(executed).toEqual([]);

    present = true;
    await applyDeclaredFieldRenames(options);
    expect(executed).toEqual([
      'ALTER TABLE "collection_articles" RENAME COLUMN "oldViews" TO "views"',
    ]);
  });

  it("skips when the new column already exists and never throws on bad identifiers", async () => {
    const execute = vi.fn(async () => undefined);
    await applyDeclaredFieldRenames({
      dialect: "postgresql",
      tableKey: nextTableKey("pg-skip"),
      physicalName: "collection_articles",
      fields: [{ db_fieldName: "views", renamedFrom: "oldViews" }],
      listColumns: async () => new Set(["views"]),
      execute,
    });
    expect(execute).not.toHaveBeenCalled();

    await applyDeclaredFieldRenames({
      dialect: "postgresql",
      tableKey: nextTableKey("pg-bad"),
      physicalName: "collection_articles",
      fields: [{ db_fieldName: 'bad"name', renamedFrom: "oldViews" }],
      listColumns: async () => new Set(["oldViews"]),
      execute,
    });
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("applyMongoFieldRenames", () => {
  it("renames once per model and no-ops for rename-free schemas", async () => {
    const updateMany = vi.fn(async () => ({}));
    const model = { updateMany };
    const fields = [{ db_fieldName: "views", renamedFrom: "oldViews" }];

    await applyMongoFieldRenames(model, fields);
    await applyMongoFieldRenames(model, fields);

    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith(
      { oldViews: { $exists: true } },
      { $rename: { oldViews: "views" } },
    );

    const plain = { updateMany: vi.fn(async () => ({})) };
    await applyMongoFieldRenames(plain, [{ db_fieldName: "title" }]);
    expect(plain.updateMany).not.toHaveBeenCalled();
  });
});

describe("materializedSqlType", () => {
  it("maps exact string types per dialect", () => {
    expect(materializedSqlType("sqlite", "decimal")).toBe("TEXT");
    expect(materializedSqlType("postgresql", "bigint")).toBe("VARCHAR(64)");
    expect(materializedSqlType("mariadb", "calendarDay")).toBe("VARCHAR(10)");
    expect(materializedSqlType("postgresql", "bytes")).toBe("TEXT");
  });

  it("returns null for non-exact types", () => {
    expect(materializedSqlType("postgresql", "number")).toBeNull();
    expect(materializedSqlType("postgresql", "string")).toBeNull();
    expect(materializedSqlType("postgresql", undefined)).toBeNull();
  });
});
