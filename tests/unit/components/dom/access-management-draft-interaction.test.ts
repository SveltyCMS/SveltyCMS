/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/access-management-draft-interaction.test.ts
 * @description Page-level draft/snapshot state machine for Access Management.
 *
 * Mounts the real `/config/access-management/+page.svelte`. The permissions tab
 * writes into the page-owned `rolesData` draft through `setRoleData`, so the
 * tests below exercise the exact path a user takes: toggle a permission, save,
 * edit again, reset.
 *
 * The audit findings this pins:
 * - F03: Reset used to restore `page.data.roles` (the page-load snapshot), so
 *   after a successful save + second edit it silently reverted to stale values.
 *   Reset must restore the *last saved* draft instead.
 * - F04: A confirmed unsaved-changes prompt used to only clear the dirty flag
 *   and leave the user on the page. It must resume the cancelled destination;
 *   cancelling the prompt must keep the draft and keep Save enabled.
 *
 * Only boundaries are mocked: the HTTP client, the confirm dialog, and toasts.
 * The page, tab, permissions table, checkbox bindings, snapshot logic, save
 * flag, and `beforeNavigate` guard all run for real.
 *
 * ### Features:
 * - edit → save → edit → reset restores the last saved value
 * - save promotes the draft to the new baseline
 * - cancelling the leave prompt keeps the draft and Save enabled
 * - confirming the leave prompt resumes the cancelled destination
 * - `onNavigate` fires only for the navigation that actually proceeds
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import AccessManagementPage from "@src/routes/(app)/config/access-management/+page.svelte";
// Import the mock modules directly: the Vitest aliases resolve to these exact
// files, so this is the same module instance the page sees at runtime — with
// types for the test-only navigation helpers.
import { page } from "../../mocks/$app/state";
import {
  goto,
  onNavigate,
  __navigateForTest,
  __resetNavigationForTest,
} from "../../mocks/$app/navigation";
import { click, renderComponent, settle } from "./render";

const h = vi.hoisted(() => ({
  fetchApi: vi.fn(),
  confirm: vi.fn(),
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@utils/api", () => ({ fetchApi: h.fetchApi }));

vi.mock("@utils/modal.svelte", () => ({
  showConfirm: h.confirm,
  showModal: vi.fn(),
  showDeleteConfirm: vi.fn(),
  showStatusChangeConfirm: vi.fn(),
  showScheduleModal: vi.fn(),
  showCloneModal: vi.fn(),
  modalState: {
    isOpen: false,
    active: null,
    trigger: vi.fn(),
    close: vi.fn(),
    clear: vi.fn(),
  },
}));

vi.mock("@src/stores/toast.svelte.ts", () => ({ toast: h.toast }));

const PERMISSIONS = [
  {
    _id: "content:read",
    name: "Read Content",
    action: "read",
    type: "collection",
  },
  {
    _id: "content:write",
    name: "Write Content",
    action: "write",
    type: "collection",
  },
];

const ROLES = [
  {
    _id: "editor-role",
    name: "Editor",
    description: "Can edit content",
    permissions: ["content:read"],
    isAdmin: false,
  },
  {
    _id: "admin-role",
    name: "Administrator",
    description: "Full system access",
    permissions: ["content:read", "content:write"],
    isAdmin: true,
  },
];

type Rendered = ReturnType<typeof renderComponent>;

function permissionCheckbox(
  target: HTMLElement,
  role: string,
  permission: string,
): HTMLInputElement {
  const input = target.querySelector<HTMLInputElement>(
    `input[type='checkbox'][aria-label='Toggle ${role} for ${permission}']`,
  );
  if (!input) throw new Error(`checkbox ${role}/${permission} not rendered`);
  return input;
}

function saveButton(target: HTMLElement): HTMLButtonElement {
  const button = target.querySelector<HTMLButtonElement>("[data-testid='access-mgmt-save']");
  if (!button) throw new Error("save button not rendered");
  return button;
}

function resetButton(target: HTMLElement): HTMLButtonElement {
  const button = target.querySelector<HTMLButtonElement>("[data-testid='access-mgmt-reset']");
  if (!button) throw new Error("reset button not rendered");
  return button;
}

async function toggle(target: HTMLElement, role: string, permission: string): Promise<void> {
  await click(permissionCheckbox(target, role, permission));
  await settle();
}

async function mount(): Promise<Rendered> {
  const rendered = renderComponent(AccessManagementPage);
  await settle();
  await vi.waitFor(() =>
    expect(permissionCheckbox(rendered.target, "Editor", "Read Content")).toBeInTheDocument(),
  );
  return rendered;
}

beforeEach(() => {
  __resetNavigationForTest();
  vi.mocked(goto).mockClear();
  vi.mocked(onNavigate).mockClear();

  page.url = new URL("http://localhost/config/access-management");
  page.data = {
    roles: structuredClone(ROLES),
    permissions: structuredClone(PERMISSIONS),
  };

  h.fetchApi.mockReset();
  h.fetchApi.mockResolvedValue({ success: true });

  h.confirm.mockReset();
  h.confirm.mockResolvedValue(false);

  for (const fn of Object.values(h.toast)) fn.mockReset();
});

describe("Access Management — draft/snapshot state (client interaction)", () => {
  it("resets to the last saved role snapshot, not the page-load snapshot (F03)", async () => {
    const { target, cleanup } = await mount();
    try {
      const read = () => permissionCheckbox(target, "Editor", "Read Content");
      const write = () => permissionCheckbox(target, "Editor", "Write Content");

      // Page-load baseline: Editor can read, cannot write.
      expect(read().checked).toBe(true);
      expect(write().checked).toBe(false);
      expect(saveButton(target)).toBeDisabled();

      // Edit 1: read -> write, then persist. This becomes the new baseline.
      await toggle(target, "Editor", "Read Content");
      await toggle(target, "Editor", "Write Content");
      expect(read().checked).toBe(false);
      expect(write().checked).toBe(true);
      expect(saveButton(target)).toBeEnabled();

      await click(saveButton(target));
      await vi.waitFor(() => expect(h.fetchApi).toHaveBeenCalledTimes(1));
      await vi.waitFor(() => expect(saveButton(target)).toBeDisabled());
      expect(read().checked).toBe(false);
      expect(write().checked).toBe(true);

      // Edit 2: drop the permission again without saving.
      await toggle(target, "Editor", "Write Content");
      expect(write().checked).toBe(false);
      expect(saveButton(target)).toBeEnabled();

      await click(resetButton(target));

      // Pre-F03 `resetChanges` restored `page.data.roles` (Editor = read only),
      // so `read` would be checked here. It must restore the saved draft instead.
      expect(write().checked).toBe(true);
      expect(read().checked).toBe(false);
      expect(saveButton(target)).toBeDisabled();
      expect(resetButton(target)).toBeDisabled();
    } finally {
      cleanup();
    }
  });

  it("keeps the draft and Save enabled when the leave prompt is cancelled (F04)", async () => {
    const { target, cleanup } = await mount();
    try {
      await toggle(target, "Editor", "Read Content");
      expect(permissionCheckbox(target, "Editor", "Read Content").checked).toBe(false);
      expect(saveButton(target)).toBeEnabled();

      h.confirm.mockResolvedValue(false);

      // A router navigation is cancelled by the page guard; the async prompt
      // resolves to "stay on this page".
      const proceeded = await __navigateForTest("/dashboard");
      expect(proceeded).toBe(false);
      await vi.waitFor(() => expect(h.confirm).toHaveBeenCalledTimes(1));
      await settle();

      // Cancelling must not discard the draft nor clear the dirty flag.
      expect(permissionCheckbox(target, "Editor", "Read Content").checked).toBe(false);
      expect(saveButton(target)).toBeEnabled();
      expect(goto).not.toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });

  it("resumes the cancelled destination when the leave prompt is confirmed (F04)", async () => {
    const { target, cleanup } = await mount();
    try {
      const onNavigateSpy = vi.fn();
      onNavigate(onNavigateSpy);

      await toggle(target, "Editor", "Read Content");
      expect(saveButton(target)).toBeEnabled();

      h.confirm.mockResolvedValue(true);

      // The first attempt is cancelled by the guard (beforeNavigate), then the
      // confirmed prompt navigates to the exact destination.
      const proceeded = await __navigateForTest("/dashboard");
      expect(proceeded).toBe(false);

      await vi.waitFor(() =>
        expect(vi.mocked(goto)).toHaveBeenCalledWith("http://localhost/dashboard"),
      );
      await vi.waitFor(() => expect(saveButton(target)).toBeDisabled());

      // `onNavigate` only fires for the navigation that actually proceeds —
      // the cancelled first attempt must not reach it.
      expect(onNavigateSpy).toHaveBeenCalledTimes(1);
      expect(onNavigateSpy.mock.calls[0][0].to.url.pathname).toBe("/dashboard");
    } finally {
      cleanup();
    }
  });
});
