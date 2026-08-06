/**
 * @file tests/unit/databases/collection-module-security.test.ts
 * @description Whitebox proofs that index DDL never embeds unsanitized
 * identifiers from admin-typed schema labels.
 *
 * Collection ids and db_fieldNames are config-derived, but field LABELS are
 * free text entered in the collection builder — a label containing `"` or
 * SQL metacharacters must never break out of the quoted identifier in
 * `CREATE INDEX` statements (assertSafeSqlIdentifier throws instead).
 */

import { describe, it, expect, vi } from "vitest";
import { CollectionModule } from "@src/databases/core/collection-module";
import type { Schema } from "@src/content/types";

function createHarness(exec: ReturnType<typeof vi.fn>) {
  const adapter = {
    wrap: async (fn: () => Promise<void>) => fn(),
    sqlite: { exec },
    modelRegistry: new Map(),
    tableRegistry: new Map(),
    type: "sqlite",
  };
  const module = new CollectionModule(adapter as any);
  return { module, exec };
}

const schemaWithLabel = (label: string): Schema =>
  ({
    fields: [{ label, unique: true }],
  }) as unknown as Schema;

describe("CollectionModule.createIndexes identifier hardening", () => {
  it("builds DDL with a safe identifier for a plain label", async () => {
    const exec = vi.fn();
    const { module } = createHarness(exec);
    await module.createIndexes("posts", schemaWithLabel("title"));
    expect(exec).toHaveBeenCalledWith(
      'CREATE UNIQUE INDEX IF NOT EXISTS "idx_posts_title" ON "collection_posts" ("title")',
    );
  });

  it("rejects a label that would break out of the quoted identifier", async () => {
    const exec = vi.fn();
    const { module } = createHarness(exec);
    const malicious = 'title"; DROP TABLE content_nodes;--';
    await expect(module.createIndexes("posts", schemaWithLabel(malicious))).rejects.toThrow(
      "Invalid SQL identifier",
    );
    // The raw label must never reach the SQLite client.
    expect(exec).not.toHaveBeenCalled();
  });

  it("rejects a collection id with SQL metacharacters", async () => {
    const exec = vi.fn();
    const { module } = createHarness(exec);
    await expect(
      module.createIndexes('posts"; DROP TABLE x;--', schemaWithLabel("title")),
    ).rejects.toThrow("Invalid SQL identifier");
    expect(exec).not.toHaveBeenCalled();
  });
});
