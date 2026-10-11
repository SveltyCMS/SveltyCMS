/**
 * @file tests/unit/services/migration-rename-exempt.test.ts
 * @description A declared field rename is not scored as data loss.
 */

import { describe, expect, it } from "vitest";
import type { MigrationPlan } from "@src/services/core/migration-engine";
import { exemptDeclaredFieldRenames } from "@src/services/core/migration-engine";
import type { SchemaChange } from "@utils/schema/comparison";

function plan(changes: SchemaChange[]): MigrationPlan {
  return {
    planId: "p1",
    collectionId: "posts",
    changes,
    risk: "destructive",
    requiresConfirmation: true,
    impact: { documentsAffected: 3, dataLossPotential: true },
    preconditions: [],
    postconditions: [],
    requiresMigration: true,
  };
}

describe("exemptDeclaredFieldRenames", () => {
  it("drops the remove/add pair for a declared rename and leaves other changes", () => {
    const changes: SchemaChange[] = [
      {
        type: "field_removed",
        collectionId: "posts",
        fieldName: "oldViews",
        severity: "critical",
        message: "removed",
      },
      {
        type: "field_added",
        collectionId: "posts",
        fieldName: "views",
        severity: "info",
        message: "added",
      },
      {
        type: "type_changed",
        collectionId: "posts",
        fieldName: "title",
        severity: "critical",
        message: "type",
      },
    ];
    const next = exemptDeclaredFieldRenames(plan(changes), [
      { db_fieldName: "views", renamedFrom: "oldViews" },
    ]);
    expect(next.changes.map((change) => change.type)).toEqual(["type_changed"]);
    expect(next.requiresMigration).toBe(true);
    expect(next.risk).toBe("destructive");

    const onlyRename = exemptDeclaredFieldRenames(
      plan(changes.filter((change) => change.type !== "type_changed")),
      [{ db_fieldName: "views", renamedFrom: "oldViews" }],
    );
    expect(onlyRename.changes).toEqual([]);
    expect(onlyRename.requiresMigration).toBe(false);
    expect(onlyRename.impact.dataLossPotential).toBe(false);
  });
});
