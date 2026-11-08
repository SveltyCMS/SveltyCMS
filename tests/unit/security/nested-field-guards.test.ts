/**
 * @file tests/unit/security/nested-field-guards.test.ts
 * @description A guard on a group/repeater child must be visible to the schema
 * hot flags, the filter blocker, and the read redactor — otherwise the parent
 * looks unguarded and `team.salary` leaks through a normal collection read.
 */

import { describe, expect, it } from "vitest";
import type { FieldInstance } from "@src/content/types";
import { collectGuardedFieldPaths, fieldDeclaresGuardDeep } from "@src/utils/field-guard";
import { redactRecord } from "@src/utils/field-access";

const salary: FieldInstance = {
  db_fieldName: "salary",
  name: "salary",
  label: "Salary",
  type: "number",
  permissions: { visibility: "private", readRoles: ["admin"] },
} as unknown as FieldInstance;

const team: FieldInstance = {
  db_fieldName: "team",
  name: "team",
  label: "Team",
  type: "group",
  fields: [salary],
} as unknown as FieldInstance;

describe("nested field guards", () => {
  it("detects a guard declared on a descendant", () => {
    expect(fieldDeclaresGuardDeep(team)).toBe(true);
    expect(fieldDeclaresGuardDeep(salary)).toBe(true);
  });

  it("reports the dotted path so nested filters can be blocked", () => {
    expect(collectGuardedFieldPaths([team])).toContain("team.salary");
  });

  it("redacts a nested guarded leaf without mutating the source row", () => {
    const row = { _id: "row-1", team: { name: "Core", salary: 120_000 }, status: "publish" };
    const redacted = redactRecord(row, [team], { _id: "u1", role: "editor" }) as Record<
      string,
      unknown
    >;
    const redactedTeam = redacted.team as Record<string, unknown>;

    expect(redactedTeam.salary).toBeUndefined();
    expect(redactedTeam.name).toBe("Core");
    expect(redacted.status).toBe("publish");
    // The cached/raw row keeps the full value for privileged readers.
    expect((row.team as Record<string, unknown>).salary).toBe(120_000);
  });

  it("keeps nested guarded leaves for an admin", () => {
    const row = { team: { name: "Core", salary: 120_000 } };
    const redacted = redactRecord(row, [team], { _id: "a1", role: "admin" }) as Record<
      string,
      unknown
    >;
    expect((redacted.team as Record<string, unknown>).salary).toBe(120_000);
    expect(redacted).toBe(row);
  });

  it("redacts inside repeater-style arrays", () => {
    const rows = {
      team: [
        { name: "A", salary: 1 },
        { name: "B", salary: 2 },
      ],
    };
    const redacted = redactRecord(rows, [team], { _id: "u1", role: "editor" }) as Record<
      string,
      unknown
    >;
    const list = redacted.team as Array<Record<string, unknown>>;
    expect(list.every((entry) => entry.salary === undefined)).toBe(true);
    expect(list.map((entry) => entry.name)).toEqual(["A", "B"]);
  });
});
