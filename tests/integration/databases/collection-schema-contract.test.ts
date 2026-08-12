/**
 * @file tests/integration/databases/collection-schema-contract.test.ts
 * @description Cross-adapter contract for collection.getSchema / getSchemaById.
 *
 * Regression guard for the relational (SQL) parity gap: getSchema used to
 * always return { success: true, data: null } on SQLite/MariaDB/PostgreSQL, so
 * the migration engine could not detect schema drift. Verifies the schema is
 * read back from the content structure rows on every engine.
 *
 * Run: bun test tests/integration/databases/collection-schema-contract.test.ts
 * Matrix: DB=sqlite|postgresql|mariadb|mongodb bun test ...
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DatabaseAdapter, DatabaseId } from "@src/databases/db-interface";
import type { Schema } from "@src/content/types";
import { ensureFullInitialization, getDb } from "@src/databases/db";
import { assertRealAdapter } from "@tests/helpers/assert-real-adapter";

const TENANT: DatabaseId = "global" as DatabaseId;

function runSuffix() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getData<T>(res: { success: boolean; data?: T }): T {
  return (res as { success: true; data: T }).data;
}

let db: DatabaseAdapter;
const cleanupPaths: string[] = [];

beforeAll(async () => {
  await ensureFullInitialization();
  db = getDb() as DatabaseAdapter;
  assertRealAdapter(db);
});

afterAll(async () => {
  for (const path of new Set(cleanupPaths)) {
    try {
      await db.content.nodes.deleteMany([path], { tenantId: TENANT });
    } catch {
      // best-effort cleanup — serial suites must stay isolated
    }
  }
});

describe("collection.getSchema / getSchemaById contract", () => {
  async function seedCollectionNode(name: string) {
    const suffix = runSuffix();
    const id = `contract-schema-${suffix}`;
    const path = `/collection/${name.toLowerCase()}-${suffix}`;
    cleanupPaths.push(path);

    const schemaDef: Schema = {
      _id: id,
      name,
      path,
      fields: [],
      status: "publish",
    };

    const bulk = await db.content.nodes.bulkUpdate(
      [
        {
          path,
          id,
          changes: {
            name,
            path,
            nodeType: "collection",
            source: "builder",
            collectionDef: schemaDef,
            order: 1,
          },
        },
      ],
      { tenantId: TENANT },
    );
    expect(bulk.success).toBe(true);
    return { id, name, path };
  }

  it("getSchema returns the stored schema for a collection name", async () => {
    const { id, name } = await seedCollectionNode(`Contract Schema ${runSuffix()}`);

    const res = await db.collection.getSchema(name, TENANT);
    expect(res.success).toBe(true);
    const schema = getData<Schema | null>(res);
    // Parity guard: the relational engines previously returned data: null here,
    // which made migration-engine unable to detect schema drift.
    expect(schema, `getSchema must not be null on ${db.type}`).not.toBeNull();
    if (schema) {
      expect(schema._id).toBe(id);
      expect(schema.name).toBe(name);
    }
  });

  it("getSchemaById returns the stored schema for a collection id", async () => {
    const { id, name } = await seedCollectionNode(`Contract Schema ById ${runSuffix()}`);

    const res = await db.collection.getSchemaById(id, TENANT);
    expect(res.success).toBe(true);
    const schema = getData<Schema | null>(res);
    expect(schema, `getSchemaById must not be null on ${db.type}`).not.toBeNull();
    if (schema) {
      expect(schema._id).toBe(id);
      expect(schema.name).toBe(name);
    }
  });

  it("getSchemaById returns data:null for an unknown id", async () => {
    const res = await db.collection.getSchemaById(`contract-schema-unknown-${runSuffix()}`, TENANT);
    expect(res.success).toBe(true);
    expect(getData<Schema | null>(res)).toBeNull();
  });
});
