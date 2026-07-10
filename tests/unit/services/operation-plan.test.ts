/**
 * @file tests/unit/services/operation-plan.test.ts
 * @description Unit tests for configuration promotion plan generation logic.
 *
 * The plan generation computes an operation plan from detected sync changes
 * (new, updated, deleted items) and a requested mode. This is currently
 * exercised inline in the `/api/config/plan` handler.
 *
 * ### Tests:
 * - add/merge mode: no delete operations
 * - mirror mode: delete operations + destructive risk
 * - replace mode: delete operations
 * - Destructive operations set requiresConfirmation: true
 * - Unmet requirements populate blockedReasons
 * - Empty changes → empty operations array
 * - Only new items → safe risk
 */

import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Types matching the handler's plan shape
// ---------------------------------------------------------------------------

interface ConfigEntity {
  uuid: string;
  type: string;
  name: string;
  hash: string;
  entity: Record<string, unknown>;
}

interface PlanOperation {
  action: "create" | "update" | "delete";
  type: string;
  name: string;
  uuid: string;
}

interface OperationRequirements {
  key: string;
  value?: unknown;
}

interface SyncChanges {
  new: ConfigEntity[];
  updated: ConfigEntity[];
  deleted: ConfigEntity[];
}

type PlanMode = "add" | "merge" | "mirror" | "replace";

interface OperationPlan {
  planId: string;
  operationType: "config-promotion";
  mode: PlanMode;
  risk: "safe" | "destructive";
  operations: PlanOperation[];
  warnings: string[];
  blockedReasons: string[];
  requiresConfirmation: boolean;
}

// ---------------------------------------------------------------------------
// Plan generation function — mirrors logic in config.ts handler
// ---------------------------------------------------------------------------

function generatePlan(
  changes: SyncChanges,
  mode: PlanMode,
  unmetRequirements: OperationRequirements[] = [],
  planId = "test-plan-id",
): OperationPlan {
  const plan: OperationPlan = {
    planId,
    operationType: "config-promotion",
    mode,
    risk: "safe",
    operations: [],
    warnings: [],
    blockedReasons: [],
    requiresConfirmation: false,
  };

  for (const item of changes.new) {
    plan.operations.push({
      action: "create",
      type: item.type,
      name: item.name,
      uuid: item.uuid,
    });
  }

  for (const item of changes.updated) {
    plan.operations.push({
      action: "update",
      type: item.type,
      name: item.name,
      uuid: item.uuid,
    });
  }

  for (const item of changes.deleted) {
    if (mode === "mirror" || mode === "replace") {
      plan.operations.push({
        action: "delete",
        type: item.type,
        name: item.name,
        uuid: item.uuid,
      });
      plan.risk = "destructive";
      plan.requiresConfirmation = true;
    } else {
      plan.warnings.push(
        `Resource "${item.name}" (${item.type}) exists in DB but not in source. Use "mirror" mode to delete.`,
      );
    }
  }

  for (const req of unmetRequirements) {
    plan.blockedReasons.push(`Missing required setting: ${req.key}`);
  }

  return plan;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntity(
  uuid: string,
  overrides: Partial<{ name: string; type: string }> = {},
): ConfigEntity {
  return {
    uuid,
    type: overrides.type ?? "collection",
    name: overrides.name ?? `entity-${uuid}`,
    hash: `hash-${uuid}`,
    entity: { _id: uuid, name: overrides.name ?? `entity-${uuid}` },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Operation Plan Generation", () => {
  // ── add mode ──────────────────────────────────────────────────────────

  describe("add mode", () => {
    it("does not include delete operations", () => {
      const changes: SyncChanges = {
        new: [makeEntity("n1")],
        updated: [makeEntity("u1")],
        deleted: [makeEntity("d1")],
      };

      const plan = generatePlan(changes, "add");

      const actions = plan.operations.map((op) => op.action);
      expect(actions).toContain("create");
      expect(actions).toContain("update");
      expect(actions).not.toContain("delete");
    });

    it("warns about deleted items instead of deleting them", () => {
      const changes: SyncChanges = {
        new: [],
        updated: [],
        deleted: [makeEntity("d1", { name: "stale-collection" })],
      };

      const plan = generatePlan(changes, "add");

      expect(plan.operations).toHaveLength(0);
      expect(plan.warnings).toHaveLength(1);
      expect(plan.warnings[0]).toContain("stale-collection");
      expect(plan.warnings[0]).toContain("mirror");
    });
  });

  // ── merge mode ────────────────────────────────────────────────────────

  describe("merge mode", () => {
    it("does not include delete operations", () => {
      const changes: SyncChanges = {
        new: [makeEntity("n1")],
        updated: [],
        deleted: [makeEntity("d1", { name: "removed-in-source" })],
      };

      const plan = generatePlan(changes, "merge");

      const actions = plan.operations.map((op) => op.action);
      expect(actions).toContain("create");
      expect(actions).not.toContain("delete");
    });

    it("warns about deleted items", () => {
      const changes: SyncChanges = {
        new: [],
        updated: [],
        deleted: [makeEntity("d1", { name: "orphan-collection" })],
      };

      const plan = generatePlan(changes, "merge");
      expect(plan.warnings.length).toBeGreaterThan(0);
      expect(plan.warnings[0]).toContain("orphan-collection");
    });

    it("includes create and update operations", () => {
      const changes: SyncChanges = {
        new: [makeEntity("n1"), makeEntity("n2")],
        updated: [makeEntity("u1")],
        deleted: [],
      };

      const plan = generatePlan(changes, "merge");
      expect(plan.operations).toHaveLength(3);
      expect(plan.operations.filter((o) => o.action === "create")).toHaveLength(2);
      expect(plan.operations.filter((o) => o.action === "update")).toHaveLength(1);
    });
  });

  // ── mirror mode ───────────────────────────────────────────────────────

  describe("mirror mode", () => {
    it("includes delete operations", () => {
      const changes: SyncChanges = {
        new: [makeEntity("n1")],
        updated: [],
        deleted: [makeEntity("d1"), makeEntity("d2")],
      };

      const plan = generatePlan(changes, "mirror");

      const actions = plan.operations.map((op) => op.action);
      expect(actions).toContain("delete");
      expect(plan.operations.filter((o) => o.action === "delete")).toHaveLength(2);
    });

    it("sets risk to destructive", () => {
      const changes: SyncChanges = {
        new: [],
        updated: [],
        deleted: [makeEntity("d1")],
      };

      const plan = generatePlan(changes, "mirror");
      expect(plan.risk).toBe("destructive");
    });

    it("sets requiresConfirmation to true", () => {
      const changes: SyncChanges = {
        new: [],
        updated: [],
        deleted: [makeEntity("d1")],
      };

      const plan = generatePlan(changes, "mirror");
      expect(plan.requiresConfirmation).toBe(true);
    });

    it("does not set destructive risk when there are no deletes", () => {
      const changes: SyncChanges = {
        new: [makeEntity("n1")],
        updated: [],
        deleted: [],
      };

      const plan = generatePlan(changes, "mirror");
      expect(plan.risk).toBe("safe");
      expect(plan.requiresConfirmation).toBe(false);
    });

    it("does not produce warnings for deleted items", () => {
      const changes: SyncChanges = {
        new: [],
        updated: [],
        deleted: [makeEntity("d1", { name: "will-be-deleted" })],
      };

      const plan = generatePlan(changes, "mirror");
      expect(plan.warnings).toHaveLength(0);
    });
  });

  // ── replace mode ──────────────────────────────────────────────────────

  describe("replace mode", () => {
    it("includes delete operations", () => {
      const changes: SyncChanges = {
        new: [makeEntity("n1")],
        updated: [makeEntity("u1")],
        deleted: [makeEntity("d1")],
      };

      const plan = generatePlan(changes, "replace");

      const actions = plan.operations.map((op) => op.action);
      expect(actions).toContain("delete");
    });

    it("sets risk to destructive when deletes are included", () => {
      const changes: SyncChanges = {
        new: [],
        updated: [],
        deleted: [makeEntity("d1")],
      };

      const plan = generatePlan(changes, "replace");
      expect(plan.risk).toBe("destructive");
    });

    it("handles all three change types together", () => {
      const changes: SyncChanges = {
        new: [makeEntity("n1")],
        updated: [makeEntity("u1")],
        deleted: [makeEntity("d1")],
      };

      const plan = generatePlan(changes, "replace");
      expect(plan.operations).toHaveLength(3);
      expect(plan.operations.map((o) => `${o.action}:${o.uuid}`).sort()).toEqual([
        "create:n1",
        "delete:d1",
        "update:u1",
      ]);
    });
  });

  // ── Destructive operations set requiresConfirmation ────────────────────

  describe("requiresConfirmation", () => {
    it("is false in add mode even with deletes (deletes are not included)", () => {
      const changes: SyncChanges = {
        new: [],
        updated: [],
        deleted: [makeEntity("d1")],
      };

      const plan = generatePlan(changes, "add");
      expect(plan.requiresConfirmation).toBe(false);
    });

    it("is false in merge mode even with deletes (deletes are not included)", () => {
      const changes: SyncChanges = {
        new: [],
        updated: [],
        deleted: [makeEntity("d1")],
      };

      const plan = generatePlan(changes, "merge");
      expect(plan.requiresConfirmation).toBe(false);
    });

    it("is true in mirror mode with delete operations", () => {
      const plan = generatePlan({ new: [], updated: [], deleted: [makeEntity("d1")] }, "mirror");
      expect(plan.requiresConfirmation).toBe(true);
    });

    it("is true in replace mode with delete operations", () => {
      const plan = generatePlan({ new: [], updated: [], deleted: [makeEntity("d1")] }, "replace");
      expect(plan.requiresConfirmation).toBe(true);
    });
  });

  // ── Unmet requirements → blockedReasons ────────────────────────────────

  describe("blockedReasons (unmet requirements)", () => {
    it("populates blockedReasons when requirements are unmet", () => {
      const changes: SyncChanges = {
        new: [makeEntity("n1")],
        updated: [],
        deleted: [],
      };

      const requirements: OperationRequirements[] = [
        { key: "JWT_SECRET_KEY" },
        { key: "CACHE_DRIVER" },
      ];

      const plan = generatePlan(changes, "merge", requirements);

      expect(plan.blockedReasons).toHaveLength(2);
      expect(plan.blockedReasons[0]).toContain("JWT_SECRET_KEY");
      expect(plan.blockedReasons[1]).toContain("CACHE_DRIVER");
    });

    it("has empty blockedReasons when no requirements are unmet", () => {
      const plan = generatePlan({ new: [makeEntity("n1")], updated: [], deleted: [] }, "merge", []);

      expect(plan.blockedReasons).toHaveLength(0);
    });

    it("still generates operations even with unmet requirements", () => {
      const changes: SyncChanges = {
        new: [makeEntity("n1")],
        updated: [],
        deleted: [],
      };

      const plan = generatePlan(changes, "merge", [{ key: "MISSING" }]);

      // Operations should still be generated; blockedReasons is informational
      expect(plan.operations).toHaveLength(1);
      expect(plan.blockedReasons).toHaveLength(1);
    });
  });

  // ── No changes ────────────────────────────────────────────────────────

  describe("empty changes", () => {
    it("has empty operations array when no changes", () => {
      const plan = generatePlan({ new: [], updated: [], deleted: [] }, "merge");

      expect(plan.operations).toHaveLength(0);
    });

    it("risk remains safe", () => {
      const plan = generatePlan({ new: [], updated: [], deleted: [] }, "mirror");

      expect(plan.risk).toBe("safe");
    });

    it("warnings are empty", () => {
      const plan = generatePlan({ new: [], updated: [], deleted: [] }, "merge");

      expect(plan.warnings).toHaveLength(0);
    });
  });

  // ── Only new items → safe risk ────────────────────────────────────────

  describe("safe risk for new-only changes", () => {
    it("has risk 'safe' with only new items in merge mode", () => {
      const plan = generatePlan(
        { new: [makeEntity("n1"), makeEntity("n2")], updated: [], deleted: [] },
        "merge",
      );

      expect(plan.risk).toBe("safe");
      expect(plan.requiresConfirmation).toBe(false);
    });

    it("has risk 'safe' with only new items in mirror mode", () => {
      const plan = generatePlan({ new: [makeEntity("n1")], updated: [], deleted: [] }, "mirror");

      expect(plan.risk).toBe("safe");
    });

    it("has risk 'safe' with only updated items", () => {
      const plan = generatePlan({ new: [], updated: [makeEntity("u1")], deleted: [] }, "mirror");

      expect(plan.risk).toBe("safe");
    });
  });
});
