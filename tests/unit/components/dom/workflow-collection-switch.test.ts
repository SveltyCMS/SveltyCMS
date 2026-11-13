/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/workflow-collection-switch.test.ts
 * @description Regression pin for switching collections in the workflow editor.
 *
 * Selecting a collection whose `GET /api/workflows` answer is `data: null` only
 * cleared the id/name/description. `states` and `transitions` kept the previous
 * collection's canvas, so collection B silently presented (and could save)
 * collection A's state machine. A collection without a stored workflow must
 * fall back to the starter template.
 *
 * ### Features:
 * - loading collection A renders A's states
 * - switching to collection B (no stored workflow) drops A's states
 * - the starter template (Draft / In Review / Published) is restored for B
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import WorkflowPage from "@src/routes/(app)/config/workflows/+page.svelte";
import type { WorkflowDefinition } from "@src/types/workflow-types";
import { renderPage, settle } from "./render";

const api = vi.hoisted(() => ({
  listWorkflowCollections: vi.fn(),
  listWorkflowRoles: vi.fn(),
  loadWorkflow: vi.fn(),
  saveWorkflowDefinition: vi.fn(),
}));

vi.mock("@src/routes/(app)/config/workflows/workflows-api", () => api);

vi.mock("@utils/modal.svelte", () => ({
  showConfirm: vi.fn(),
  modalState: {},
}));

vi.mock("@src/components/system/admin-zone.svelte", () => ({ default: () => null }));

const COLLECTIONS = [
  { _id: "posts", name: "Blog Posts" },
  { _id: "articles", name: "News Articles" },
];

const STORED_WORKFLOW: WorkflowDefinition = {
  _id: "wf-posts-1",
  collectionId: "posts",
  name: "Editorial Workflow",
  states: [
    { id: "s_draft", label: "Draft", color: "#94a3b8", isInitial: true, x: 24, y: 24 },
    { id: "s_review", label: "Under Review", color: "#fbbf24", x: 240, y: 24 },
    { id: "s_approved", label: "Approved", color: "#22c55e", isFinal: true, x: 456, y: 24 },
  ],
  transitions: [
    { id: "t_submit", from: "s_draft", to: "s_review", label: "Request Review" },
    { id: "t_approve", from: "s_review", to: "s_approved", label: "Approve" },
  ],
};

function collectionSelect(target: HTMLElement): HTMLSelectElement {
  const select = target.querySelector<HTMLSelectElement>(
    "div[data-testid=workflow-collection-select] select",
  );
  if (!select) throw new Error("workflow collection select not rendered");
  return select;
}

async function selectCollection(target: HTMLElement, id: string): Promise<void> {
  const select = collectionSelect(target);
  select.value = id;
  select.dispatchEvent(new Event("change", { bubbles: true }));
  await settle();
}

describe("Workflow editor — collection switch (client interaction)", () => {
  beforeEach(() => {
    api.listWorkflowCollections.mockReset();
    api.listWorkflowRoles.mockReset();
    api.saveWorkflowDefinition.mockReset();
    api.loadWorkflow.mockReset();
    api.loadWorkflow.mockImplementation(async (collectionId: string) =>
      collectionId === "posts"
        ? { success: true, data: STORED_WORKFLOW }
        : { success: true, data: null },
    );
  });

  it("restores the starter template when the next collection has no workflow", async () => {
    const rendered = renderPage(WorkflowPage, {
      isAdmin: true,
      collections: COLLECTIONS,
      roles: [],
    });

    try {
      await settle();
      await selectCollection(rendered.target, "posts");

      expect(rendered.target.querySelector("[data-testid=workflow-state-s_review]")).not.toBeNull();
      expect(rendered.target.textContent).toContain("Under Review");

      await selectCollection(rendered.target, "articles");

      // Collection A's state machine must not survive the switch.
      expect(rendered.target.querySelector("[data-testid=workflow-state-s_review]")).toBeNull();
      expect(rendered.target.querySelector("[data-testid=workflow-state-s_approved]")).toBeNull();
      expect(rendered.target.textContent).not.toContain("Under Review");

      // A collection without a stored workflow starts from the starter template.
      expect(rendered.target.querySelector("[data-testid=workflow-state-draft]")).not.toBeNull();
      expect(rendered.target.querySelector("[data-testid=workflow-state-review]")).not.toBeNull();
      expect(
        rendered.target.querySelector("[data-testid=workflow-state-published]"),
      ).not.toBeNull();
    } finally {
      rendered.cleanup();
    }
  });
});
