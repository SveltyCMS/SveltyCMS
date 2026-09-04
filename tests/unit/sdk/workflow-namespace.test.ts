/**
 * @file tests/unit/sdk/workflow-namespace.test.ts
 * @description Unit tests for the LocalCMS workflow namespace
 * (src/services/sdk/namespaces/workflow-namespace.ts): programmatic
 * transitions with mapped options, instance/history reads, and definition
 * peeks — the documented `cms.workflow.*` SDK surface.
 *
 * Runs against the same in-memory adapter fake as the workflow-service
 * completion suite; the workflow:transitioned event bus is globally mocked.
 *
 * Features:
 * - transition() delegates with entryId/targetState/comment/assigneeId mapping
 * - getInstance returns the enrolled instance (null-safe)
 * - getHistory returns the immutable history array (never the instance)
 * - getWorkflowForCollection surfaces the cached definition
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowNamespace } from "@src/services/sdk/namespaces/workflow-namespace";
import type { User } from "@src/databases/auth/types";
import type { WorkflowDefinition } from "@src/types/workflow-types";

vi.mock("@src/services/security/audit-service", () => ({
  auditLogService: { logEvent: vi.fn().mockResolvedValue(undefined) },
  AuditEventType: { WORKFLOW_TRANSITION: "workflow.transition" },
}));

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

vi.mock("@src/databases/db", () => ({ dbAdapter: fakeAdapter }));

import { nowISODateString } from "@utils/date";

const ACTOR: User = {
  _id: "u-reviewer" as unknown as import("@src/content/types").DatabaseId,
  role: "reviewer",
  isAdmin: false,
  email: "rev@test.dev",
  permissions: [],
  createdAt: nowISODateString(),
  updatedAt: nowISODateString(),
};

const definition: WorkflowDefinition = {
  _id: "wf-1",
  tenantId: "t1",
  collectionId: "posts",
  name: "Editorial",
  gatePublication: true,
  states: [
    { id: "draft", label: "Draft", color: "#94a3b8", isInitial: true },
    { id: "review", label: "In Review", color: "#fbbf24", requiresAssignee: true },
    { id: "approved", label: "Approved", color: "#22c55e", isFinal: true },
  ],
  transitions: [
    { id: "t1", from: "draft", to: "review", label: "Submit" },
    { id: "t2", from: "review", to: "approved", label: "Approve" },
  ],
};

describe("WorkflowNamespace", () => {
  let ns: WorkflowNamespace;

  beforeEach(() => {
    store.workflow_definitions.length = 0;
    store.workflow_instances.length = 0;
    store.workflow_definitions.push({ ...definition });
    ns = new WorkflowNamespace();
  });

  it("returns the workflow definition for a collection", async () => {
    const def = await ns.getWorkflowForCollection("posts", "t1");
    expect(def?.collectionId).toBe("posts");
    expect(def?.gatePublication).toBe(true);
  });

  it("returns null for an unenrolled entry instance", async () => {
    await expect(ns.getInstance("missing", "t1")).resolves.toBeNull();
  });

  it("returns the history array (never the instance) for an enrolled entry", async () => {
    store.workflow_instances.push({
      _id: "inst-1",
      tenantId: "t1",
      entryId: "entry-1",
      collectionId: "posts",
      currentState: "review",
      assigneeId: ACTOR._id,
      history: [
        {
          fromState: "draft",
          toState: "review",
          userId: "u-editor",
          timestamp: 1,
          comment: "please review",
        },
      ],
    });
    const history = await ns.getHistory("posts", "entry-1", "t1");
    expect(Array.isArray(history)).toBe(true);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ fromState: "draft", toState: "review" });
  });

  it("maps transition options (incl. assignee + comment) onto the service call", async () => {
    store.workflow_instances.push({
      _id: "inst-1",
      tenantId: "t1",
      entryId: "entry-1",
      collectionId: "posts",
      currentState: "draft",
      history: [],
    });
    const instance = await ns.transition({
      collectionId: "posts",
      entryId: "entry-1",
      targetState: "review",
      comment: "submitting for review",
      assigneeId: ACTOR._id,
      user: ACTOR,
      tenantId: "t1",
    });
    expect(instance.currentState).toBe("review");
    expect(instance.assigneeId).toBe(ACTOR._id);
    expect(instance.history[0]).toMatchObject({
      fromState: "draft",
      toState: "review",
      comment: "submitting for review",
    });
  });

  it("rejects an invalid transition via the service (no workflow edge)", async () => {
    store.workflow_instances.push({
      _id: "inst-1",
      tenantId: "t1",
      entryId: "entry-1",
      collectionId: "posts",
      currentState: "approved",
      history: [],
    });
    await expect(
      ns.transition({ entryId: "entry-1", targetState: "draft", user: ACTOR, tenantId: "t1" }),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });
});
