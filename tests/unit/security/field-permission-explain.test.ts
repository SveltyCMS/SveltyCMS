/**
 * @file tests/unit/security/field-permission-explain.test.ts
 * @description Permission explain dry-run (`explainCollectionAccess`).
 *
 * ### Features:
 * - Decision parity with `canAccessField` (the enforcement predicate)
 * - Dotted paths for nested group/repeater leaves
 * - Parent denial propagates to children (`parent_denied`)
 * - Admin bypass, hidden fields, empty role lists, requiredAuth
 */

import { describe, expect, it } from "vitest";
import {
  explainCollectionAccess,
  explainFieldPermissions,
} from "@src/services/security/field-permission-service";
import { canAccessField } from "@utils/field-access";
import type { FieldInstance } from "@src/content/types";

const fields = [
  { name: "title", type: "text" },
  {
    name: "internal_notes",
    type: "text",
    permissions: { visibility: "private", readRoles: ["admin", "editor"], writeRoles: ["admin"] },
  },
  { name: "salary", type: "text", permissions: { writeRoles: ["admin"] } },
  {
    name: "seo",
    type: "group",
    fields: [
      { name: "title", type: "text" },
      { name: "budget", type: "text", permissions: { readRoles: ["admin"] } },
    ],
  },
  {
    name: "compensation",
    type: "group",
    permissions: { readRoles: ["admin"] },
    fields: [{ name: "currency", type: "text" }],
  },
  { name: "legacy", type: "text", permissions: { readRoles: [] } },
  { name: "secret", type: "text", hidden: true },
  { name: "members_only", type: "text", permissions: { requiredAuth: true } },
] as unknown as FieldInstance[];

const editor = { _id: "user-1", role: "editor" };
const admin = { _id: "user-2", role: "admin", isAdmin: true };
const anonymous = null;

function byPath(
  decisions: ReturnType<typeof explainFieldPermissions>,
): Map<string, (typeof decisions)[number]> {
  return new Map(decisions.map((decision) => [decision.path, decision]));
}

describe("explainFieldPermissions", () => {
  it("matches canAccessField for every field and operation", () => {
    for (const actor of [editor, admin, anonymous]) {
      const decisions = byPath(explainFieldPermissions(fields, actor));
      for (const field of fields) {
        const name = (field as unknown as { name: string }).name;
        const decision = decisions.get(name);
        expect(decision, `missing decision for ${name}`).toBeDefined();
        expect(decision?.read, `${name}.read`).toBe(canAccessField(field, actor, "read"));
        expect(decision?.write, `${name}.write`).toBe(canAccessField(field, actor, "write"));
      }
    }
  });

  it("explains visibility denials with the enforcement decision", () => {
    const decisions = byPath(explainFieldPermissions(fields, editor));
    const notes = decisions.get("internal_notes");

    expect(notes?.read).toBe(true);
    expect(notes?.readReason).toBe("visibility_granted");
    expect(notes?.write).toBe(false);
    expect(notes?.writeReason).toBe("visibility_denied");
  });

  it("reports role grants and role exclusions", () => {
    const decisions = byPath(explainFieldPermissions(fields, editor));

    expect(decisions.get("salary")?.write).toBe(false);
    expect(decisions.get("salary")?.writeReason).toBe("role_not_granted");
    expect(decisions.get("salary")?.read).toBe(true);
    expect(decisions.get("salary")?.readReason).toBe("no_policy");
  });

  it("flattens nested fields to dotted paths and inherits parent access", () => {
    const decisions = byPath(explainFieldPermissions(fields, editor));

    expect(decisions.get("seo.title")?.read).toBe(true);
    expect(decisions.get("seo.budget")?.read).toBe(false);
    expect(decisions.get("seo.budget")?.readReason).toBe("role_not_granted");

    // Parent group is admin-only → the child is unreachable regardless of its own policy.
    expect(decisions.get("compensation.currency")?.read).toBe(false);
    expect(decisions.get("compensation.currency")?.readReason).toBe("parent_denied");
  });

  it("explains empty role lists, hidden fields and requiredAuth", () => {
    const decisions = byPath(explainFieldPermissions(fields, editor));

    expect(decisions.get("legacy")?.read).toBe(false);
    expect(decisions.get("legacy")?.readReason).toBe("role_list_empty");
    expect(decisions.get("secret")?.readReason).toBe("hidden");

    const anon = byPath(explainFieldPermissions(fields, anonymous));
    expect(anon.get("members_only")?.read).toBe(false);
    expect(anon.get("members_only")?.readReason).toBe("auth_required");
  });

  it("marks admins as allowed for every field", () => {
    const decisions = explainFieldPermissions(fields, admin);

    expect(decisions.every((decision) => decision.read && decision.write)).toBe(true);
    expect(decisions.every((decision) => decision.readReason === "admin")).toBe(true);
  });
});

describe("explainCollectionAccess", () => {
  it("returns the denied path sets the enforcement layers act on", () => {
    const explanation = explainCollectionAccess(fields, editor);

    expect(explanation.role).toBe("editor");
    expect(explanation.readDenied).toEqual(
      expect.arrayContaining([
        "seo.budget",
        "compensation",
        "compensation.currency",
        "legacy",
        "secret",
      ]),
    );
    expect(explanation.readDenied).not.toContain("members_only");
    expect(explanation.writeDenied).toEqual(
      expect.arrayContaining(["internal_notes", "salary", "secret"]),
    );
    expect(explanation.writeDenied).not.toContain("title");
  });

  it("defaults the role label to public for anonymous actors", () => {
    const explanation = explainCollectionAccess(fields, anonymous);

    expect(explanation.role).toBe("public");
    expect(explanation.readDenied).toContain("members_only");
  });
});
