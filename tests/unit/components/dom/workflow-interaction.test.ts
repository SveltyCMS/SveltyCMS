/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/workflow-interaction.test.ts
 * @description Real DOM tests for the visual Workflow state machine editor.
 *
 * Exercises `src/routes/(app)/config/workflows/+page.svelte`:
 * collection loading, workflow loading, adding/deleting states,
 * selecting state to open the properties inspector, and saving the definition.
 *
 * ### Features:
 * - loads collections & roles on mount
 * - loads workflow on collection selection
 * - adds new state cards
 * - deletes a state card
 * - inspects and edits state properties
 * - saves workflow definition payload
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import WorkflowPage from "@src/routes/(app)/config/workflows/+page.svelte";
import type { WorkflowDefinition } from "@src/types/workflow-types";
import { click, press, renderPage, settle, typeText } from "./render";

function inputWithLabel(target: HTMLElement, text: string): HTMLInputElement | null {
  const label = [...target.querySelectorAll("label")].find((l) => l.textContent?.includes(text));
  if (!label || !label.htmlFor) return null;
  return target.querySelector<HTMLInputElement>(`#${CSS.escape(label.htmlFor)}`);
}

const api = vi.hoisted(() => ({
  listWorkflowCollections: vi.fn(),
  listWorkflowRoles: vi.fn(),
  loadWorkflow: vi.fn(),
  saveWorkflowDefinition: vi.fn(),
}));

vi.mock("@src/routes/(app)/config/workflows/workflows-api", () => api);

const MOCK_COLLECTIONS = [
  { _id: "posts", name: "Blog Posts" },
  { _id: "articles", name: "News Articles" },
];

const MOCK_ROLES = [
  { _id: "editor", name: "Editor" },
  { _id: "reviewer", name: "Reviewer" },
];

const MOCK_WORKFLOW: WorkflowDefinition = {
  _id: "wf-posts-1",
  collectionId: "posts",
  name: "Editorial Workflow",
  description: "Standard editorial approval cycle",
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

beforeEach(() => {
  api.listWorkflowCollections.mockReset();
  api.listWorkflowCollections.mockResolvedValue(MOCK_COLLECTIONS);
  api.listWorkflowRoles.mockReset();
  api.listWorkflowRoles.mockResolvedValue(MOCK_ROLES);
  api.loadWorkflow.mockReset();
  api.loadWorkflow.mockResolvedValue({ success: true, data: MOCK_WORKFLOW });
  api.saveWorkflowDefinition.mockReset();
  api.saveWorkflowDefinition.mockResolvedValue({
    success: true,
    data: { ...MOCK_WORKFLOW, _id: "saved-id" },
  });
});

describe("Workflow Editor (DOM interaction)", () => {
  /** SSR-first: the page receives collections + roles from its server load. */
  function mountPage() {
    return renderPage(WorkflowPage, {
      isAdmin: true,
      collections: MOCK_COLLECTIONS,
      roles: MOCK_ROLES,
    });
  }

  it("renders collections and roles from the server payload", async () => {
    const { target, cleanup } = mountPage();

    try {
      await settle();
      // No duplicate client fetch: the load already resolved the lists.
      expect(api.listWorkflowCollections).not.toHaveBeenCalled();
      expect(api.listWorkflowRoles).not.toHaveBeenCalled();

      // Verify the target collection select contains the server options
      const select = target.querySelector<HTMLSelectElement>(
        "div[data-testid=workflow-collection-select] select",
      );
      expect(select).toBeDefined();
      const options = [...(select?.options ?? [])];
      expect(
        options.some((o) => o.value === "posts" && o.textContent?.includes("Blog Posts")),
      ).toBe(true);
      expect(
        options.some((o) => o.value === "articles" && o.textContent?.includes("News Articles")),
      ).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("loads existing workflow when a collection is selected", async () => {
    const { target, cleanup } = mountPage();

    try {
      await settle();
      const select = target.querySelector<HTMLSelectElement>(
        "div[data-testid=workflow-collection-select] select",
      );
      expect(select).toBeDefined();

      if (select) {
        select.value = "posts";
        select.dispatchEvent(new Event("change", { bubbles: true }));
        await settle();
      }

      expect(api.loadWorkflow).toHaveBeenCalledWith("posts");

      // Verify loaded workflow name and description populated into inputs
      const nameInput = inputWithLabel(target, "Workflow Name");
      expect(nameInput?.value).toBe("Editorial Workflow");

      const descInput = inputWithLabel(target, "Description");
      expect(descInput?.value).toBe("Standard editorial approval cycle");

      // Verify state cards loaded into canvas
      expect(target.querySelector("[data-testid=workflow-state-s_draft]")).toBeDefined();
      expect(target.querySelector("[data-testid=workflow-state-s_review]")).toBeDefined();
      expect(target.querySelector("[data-testid=workflow-state-s_approved]")).toBeDefined();
    } finally {
      cleanup();
    }
  });

  it("adds a new state card when 'Add State' button is clicked", async () => {
    const { target, cleanup } = mountPage();

    try {
      await settle();
      const initialCards = target.querySelectorAll("[data-testid^=workflow-state-]");
      const initialCount = initialCards.length;

      const addStateBtn = target.querySelector<HTMLButtonElement>(
        "[data-testid=workflow-add-state]",
      );
      expect(addStateBtn).toBeDefined();

      await click(addStateBtn);

      const afterCards = target.querySelectorAll("[data-testid^=workflow-state-]");
      expect(afterCards.length).toBe(initialCount + 1);
    } finally {
      cleanup();
    }
  });

  it("removes a state card when its delete button is clicked", async () => {
    const { target, cleanup } = mountPage();

    try {
      await settle();
      // Default initial states: draft, review, published
      expect(target.querySelector("[data-testid=workflow-state-published]")).toBeDefined();

      const deleteBtn = target.querySelector<HTMLButtonElement>(
        "button[aria-label='Delete state Published']",
      );
      expect(deleteBtn).toBeDefined();

      await click(deleteBtn);

      expect(target.querySelector("[data-testid=workflow-state-published]")).toBeNull();
    } finally {
      cleanup();
    }
  });

  it("selects a state and displays its properties in the inspector", async () => {
    const { target, cleanup } = mountPage();

    try {
      await settle();
      const draftCard = target.querySelector<HTMLElement>("[data-testid=workflow-state-draft]");
      expect(draftCard).toBeDefined();

      // Activate the state card to select it
      await press(draftCard, "Enter");

      // The properties inspector should now display the state properties
      const labelInput = target.querySelector<HTMLInputElement>("input#state-name");
      expect(labelInput).toBeDefined();
      expect(labelInput?.value).toBe("Draft");

      // Update the label via the inspector
      await typeText(labelInput, "Initial Draft");

      // Card input should reflect the update
      const cardInput = draftCard?.querySelector<HTMLInputElement>("input");
      expect(cardInput?.value).toBe("Initial Draft");
    } finally {
      cleanup();
    }
  });

  it("saves workflow definition with current states and transitions", async () => {
    const { target, cleanup } = mountPage();

    try {
      await settle();
      const select = target.querySelector<HTMLSelectElement>(
        "div[data-testid=workflow-collection-select] select",
      );
      if (select) {
        select.value = "posts";
        select.dispatchEvent(new Event("change", { bubbles: true }));
        await settle();
      }

      const saveBtn = target.querySelector<HTMLButtonElement>("[data-testid=workflow-save]");
      expect(saveBtn).toBeDefined();

      await click(saveBtn);

      expect(api.saveWorkflowDefinition).toHaveBeenCalledTimes(1);
      const savedPayload = api.saveWorkflowDefinition.mock.calls[0][0];
      expect(savedPayload.collectionId).toBe("posts");
      expect(savedPayload.name).toBe("Editorial Workflow");
      expect(savedPayload.states.length).toBe(3);
      expect(savedPayload.transitions.length).toBe(2);
    } finally {
      cleanup();
    }
  });
});
