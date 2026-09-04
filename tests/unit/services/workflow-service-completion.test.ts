/**
 * @file tests/unit/services/workflow-service-completion.test.ts
 * @description Unit tests for the workflow governance completion:
 * assignee/reviewer semantics (requiresAssignee states + assignee lock),
 * the publication gate (gatePublication → final state required) and the
 * workflow:transitioned automation event. Runs against an in-memory fake of
 * the DB adapter — no harness, no network.
 *
 * Features:
 * - Gate: off/no definition → publish allowed; on + final state → allowed
 * - Gate: on + non-final state / missing instance → 403 WORKFLOW_PUBLISH_GATE
 * - Gate: missing instance auto-enrolls the entry (no permanent deadlock)
 * - Gate: admins/super-admins keep an explicit override
 * - Assignee: entering a requiresAssignee state demands an assignee (400)
 * - Assignee: only the assigned reviewer (or admin) may advance (403)
 * - Assignee: assign() handoff restricted to admins / current assignee
 * - Side effects: eventBus emits workflow:transitioned after a transition
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { workflowService } from "@src/services/background/workflow-service";
import { eventBus } from "@src/services/background/automation/event-bus";
import type { DatabaseId } from "@src/content/types";
import { nowISODateString } from "@utils/date";
import type { User } from "@src/databases/auth/types";
import type { WorkflowDefinition, WorkflowInstance } from "@src/types/workflow-types";

vi.mock("@src/databases/db", () => ({ dbAdapter: fakeAdapter }));

vi.mock("@src/services/security/audit-service", () => ({
  auditLogService: { logEvent: vi.fn().mockResolvedValue(undefined) },
  AuditEventType: { WORKFLOW_TRANSITION: "workflow.transition" },
}));

// ── In-memory adapter fake (hoisted: referenced by the db mock factory) ──
const { store, fakeAdapter } = vi.hoisted(() => {
  const store: Record<string, any[]> = {
    workflow_definitions: [],
    workflow_instances: [],
  };

  const fakeAdapter = {
    crud: {
      findMany: async (collection: string, filter: Record<string, unknown>) => {
        const rows = store[collection].filter((r) =>
          Object.entries(filter).every(([k, v]) => r[k] === v),
        );
        return { success: true, data: rows, total: rows.length };
      },
      findOne: async (collection: string, filter: Record<string, unknown>) => {
        const row = store[collection].find((r) =>
          Object.entries(filter).every(([k, v]) => r[k] === v),
        );
        return { success: true, data: row ?? null };
      },
      insert: async (collection: string, doc: Record<string, unknown>) => {
        store[collection].push({ ...doc });
        return { success: true, data: { ...doc } };
      },
      update: async (collection: string, id: string, doc: Record<string, unknown>) => {
        const idx = store[collection].findIndex((r) => r._id === id);
        if (idx !== -1) store[collection][idx] = { ...store[collection][idx], ...doc };
        return { success: true, data: store[collection][idx] ?? { ...doc } };
      },
    },
  };

  return { store, fakeAdapter };
});

// ── Fixtures ────────────────────────────────────────────────────────────
const EDITOR: User = {
  _id: "u-editor" as unknown as DatabaseId,
  role: "editor",
  isAdmin: false,
  email: "editor@test.dev",
  permissions: [],
  createdAt: nowISODateString(),
  updatedAt: nowISODateString(),
};
const REVIEWER: User = {
  _id: "u-reviewer" as unknown as DatabaseId,
  role: "reviewer",
  isAdmin: false,
  email: "rev@test.dev",
  permissions: [],
  createdAt: nowISODateString(),
  updatedAt: nowISODateString(),
};
const ADMIN: User = {
  _id: "u-admin" as unknown as DatabaseId,
  role: "admin",
  isAdmin: true,
  email: "admin@test.dev",
  permissions: [],
  createdAt: nowISODateString(),
  updatedAt: nowISODateString(),
};
const TENANT = "t1";

function makeDefinition(gatePublication = true): WorkflowDefinition {
  return {
    _id: "wf-1",
    tenantId: TENANT,
    collectionId: "posts",
    name: "Editorial",
    gatePublication,
    states: [
      { id: "draft", label: "Draft", color: "#94a3b8", isInitial: true },
      { id: "review", label: "In Review", color: "#fbbf24", requiresAssignee: true },
      { id: "approved", label: "Approved", color: "#22c55e", isFinal: true },
    ],
    transitions: [
      { id: "t1", from: "draft", to: "review", label: "Submit" },
      { id: "t2", from: "review", to: "approved", label: "Approve" },
      { id: "t3", from: "review", to: "draft", label: "Send back" },
    ],
  };
}

function seedInstance(overrides: Partial<WorkflowInstance> = {}): WorkflowInstance {
  const instance: WorkflowInstance = {
    _id: "inst-1",
    tenantId: TENANT,
    entryId: "entry-1",
    collectionId: "posts",
    currentState: "draft",
    history: [],
    ...overrides,
  };
  store.workflow_instances.push({ ...instance });
  return instance;
}

function expectRejected(promise: Promise<unknown>, code: string): Promise<void> {
  return expect(promise).rejects.toMatchObject({ code });
}

describe("workflow publish gate (assertPublishAllowed)", () => {
  beforeEach(() => {
    store.workflow_definitions.length = 0;
    store.workflow_instances.length = 0;
    workflowService.invalidateWorkflowCache();
  });

  it("allows publishing when no workflow definition exists", async () => {
    await expect(
      workflowService.assertPublishAllowed("posts", TENANT, EDITOR, "entry-1"),
    ).resolves.toBeUndefined();
  });

  it("allows publishing when the workflow has no gate", async () => {
    store.workflow_definitions.push(makeDefinition(false));
    await expect(
      workflowService.assertPublishAllowed("posts", TENANT, EDITOR, "entry-1"),
    ).resolves.toBeUndefined();
  });

  it("allows publishing when the instance is in a final state", async () => {
    store.workflow_definitions.push(makeDefinition(true));
    seedInstance({ currentState: "approved" });
    await expect(
      workflowService.assertPublishAllowed("posts", TENANT, EDITOR, "entry-1"),
    ).resolves.toBeUndefined();
  });

  it("blocks publishing from a non-final state", async () => {
    store.workflow_definitions.push(makeDefinition(true));
    seedInstance({ currentState: "review", assigneeId: REVIEWER._id });
    await expectRejected(
      workflowService.assertPublishAllowed("posts", TENANT, EDITOR, "entry-1"),
      "WORKFLOW_PUBLISH_GATE",
    );
  });

  it("blocks publish-on-create (no entry yet) for non-admins", async () => {
    store.workflow_definitions.push(makeDefinition(true));
    await expectRejected(
      workflowService.assertPublishAllowed("posts", TENANT, EDITOR),
      "WORKFLOW_PUBLISH_GATE",
    );
  });

  it("auto-enrolls entries that predate the workflow and blocks until approved", async () => {
    store.workflow_definitions.push(makeDefinition(true));
    seedInstance({ currentState: "approved" }); // unrelated entry
    const entryId = "legacy-entry";
    await expectRejected(
      workflowService.assertPublishAllowed("posts", TENANT, EDITOR, entryId),
      "WORKFLOW_PUBLISH_GATE",
    );
    const enrolled = store.workflow_instances.find((i) => i.entryId === entryId);
    expect(enrolled).toBeDefined();
    expect(enrolled.currentState).toBe("draft");
  });

  it("lets admins override the gate", async () => {
    store.workflow_definitions.push(makeDefinition(true));
    seedInstance({ currentState: "review", assigneeId: REVIEWER._id });
    await expect(
      workflowService.assertPublishAllowed("posts", TENANT, ADMIN, "entry-1"),
    ).resolves.toBeUndefined();
  });
});

describe("workflow assignee semantics (transition)", () => {
  beforeEach(() => {
    store.workflow_definitions.length = 0;
    store.workflow_instances.length = 0;
    workflowService.invalidateWorkflowCache();
    store.workflow_definitions.push(makeDefinition(false));
  });

  it("requires an assignee to enter a requiresAssignee state", async () => {
    seedInstance();
    await expectRejected(
      workflowService.transition("entry-1", "review", EDITOR, [], TENANT),
      "ASSIGNEE_REQUIRED",
    );
  });

  it("stores the assignee when entering a requiresAssignee state", async () => {
    seedInstance();
    const instance = await workflowService.transition(
      "entry-1",
      "review",
      EDITOR,
      [],
      TENANT,
      "please review",
      REVIEWER._id,
    );
    expect(instance.currentState).toBe("review");
    expect(instance.assigneeId).toBe(REVIEWER._id);
  });

  it("blocks advancement by a non-assignee while assigned", async () => {
    seedInstance({ currentState: "review", assigneeId: REVIEWER._id });
    await expectRejected(
      workflowService.transition("entry-1", "approved", EDITOR, [], TENANT),
      "ASSIGNEE_ONLY",
    );
  });

  it("allows the assigned reviewer to advance", async () => {
    seedInstance({ currentState: "review", assigneeId: REVIEWER._id });
    const instance = await workflowService.transition("entry-1", "approved", REVIEWER, [], TENANT);
    expect(instance.currentState).toBe("approved");
    expect(instance.assigneeId).toBeUndefined(); // cleared outside assignee states
  });

  it("lets admins advance an assigned entry", async () => {
    seedInstance({ currentState: "review", assigneeId: REVIEWER._id });
    const instance = await workflowService.transition("entry-1", "approved", ADMIN, [], TENANT);
    expect(instance.currentState).toBe("approved");
  });

  it("emits the workflow:transitioned event after a transition", async () => {
    seedInstance({ currentState: "review", assigneeId: REVIEWER._id });
    await workflowService.transition("entry-1", "approved", REVIEWER, [], TENANT);
    // The event bus is globally mocked in unit tests (setup.ts) — assert the emit.
    expect(eventBus.emit).toHaveBeenCalledWith(
      "workflow:transitioned",
      expect.objectContaining({
        tenantId: TENANT,
        collection: "posts",
        entryId: "entry-1",
      }),
    );
  });
});

describe("workflow assign() handoff", () => {
  beforeEach(() => {
    store.workflow_definitions.length = 0;
    store.workflow_instances.length = 0;
    workflowService.invalidateWorkflowCache();
    store.workflow_definitions.push(makeDefinition(false));
  });

  it("rejects assignment for a non-admin non-assignee", async () => {
    seedInstance({ currentState: "review", assigneeId: REVIEWER._id });
    await expectRejected(
      workflowService.assign("entry-1", "u-someone-else", EDITOR, TENANT),
      "FORBIDDEN",
    );
  });

  it("lets the current assignee hand the entry over", async () => {
    seedInstance({ currentState: "review", assigneeId: REVIEWER._id });
    const instance = await workflowService.assign("entry-1", "u-next-reviewer", REVIEWER, TENANT);
    expect(instance.assigneeId).toBe("u-next-reviewer");
  });

  it("requires an assigneeId", async () => {
    seedInstance();
    await expectRejected(workflowService.assign("entry-1", "", ADMIN, TENANT), "ASSIGNEE_REQUIRED");
  });
});
