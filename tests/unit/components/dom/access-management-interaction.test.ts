/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/access-management-interaction.test.ts
 * @description Real DOM tests for Access Management role modal and configuration.
 *
 * Exercises the interactive client behaviour of `role-modal.svelte`:
 * form inputs, permission search filtering, checkbox toggling, role copying,
 * validation guard on submit, and dismiss actions.
 *
 * ### Features:
 * - renders creation vs edit mode
 * - filters permissions by search term
 * - toggles permission selection via checkbox
 * - copies permissions from another role via select
 * - blocks submission when role name is empty
 * - submits trimmed payload to close callback
 * - dismisses cleanly on cancel
 */

import { describe, expect, it, vi } from "vitest";
import RoleModal from "@src/routes/(app)/config/access-management/role-modal.svelte";
import type { Permission, Role } from "@src/databases/auth/types";
import type { DatabaseId } from "@src/databases/db-interface";
import { click, renderComponent, settle, typeText } from "./render";

const MOCK_PERMISSIONS: Permission[] = [
  {
    _id: "content:read" as DatabaseId,
    name: "Read Content",
    action: "read" as any,
    type: "collection" as any,
  },
  {
    _id: "content:write" as DatabaseId,
    name: "Write Content",
    action: "write" as any,
    type: "collection" as any,
  },
  {
    _id: "media:delete" as DatabaseId,
    name: "Delete Media",
    action: "delete" as any,
    type: "system" as any,
  },
  {
    _id: "users:manage" as DatabaseId,
    name: "Manage Users",
    action: "manage" as any,
    type: "system" as any,
  },
];

const MOCK_ROLES: Role[] = [
  {
    _id: "editor-role" as DatabaseId,
    name: "Editor",
    description: "Can edit content",
    permissions: ["content:read", "content:write"],
    isAdmin: false,
  },
  {
    _id: "admin-role" as DatabaseId,
    name: "Administrator",
    description: "Full system access",
    permissions: ["content:read", "content:write", "media:delete", "users:manage"],
    isAdmin: true,
  },
];

describe("RoleModal (DOM interaction)", () => {
  it("renders in create mode with empty form and expected title", () => {
    const { target, cleanup } = renderComponent(RoleModal, {
      isEditMode: false,
      currentRoleId: "",
      roleName: "",
      roleDescription: "",
      currentGroupName: "default",
      permissions: MOCK_PERMISSIONS,
      roles: MOCK_ROLES,
    });

    try {
      const title = target.querySelector("[data-testid=role-modal-title]");
      expect(title?.textContent?.trim()).toBe("Create New Role");

      const nameInput = target.querySelector<HTMLInputElement>("input[name=roleName]");
      expect(nameInput?.value).toBe("");

      const descTextarea = target.querySelector<HTMLTextAreaElement>("textarea#role-description");
      expect(descTextarea?.value).toBe("");
    } finally {
      cleanup();
    }
  });

  it("renders in edit mode with pre-populated values and checked permissions", () => {
    const { target, cleanup } = renderComponent(RoleModal, {
      isEditMode: true,
      currentRoleId: "role-1",
      roleName: "Content Manager",
      roleDescription: "Oversees publications",
      currentGroupName: "editorial",
      selectedPermissions: ["content:read"],
      permissions: MOCK_PERMISSIONS,
      roles: MOCK_ROLES,
    });

    try {
      const title = target.querySelector("[data-testid=role-modal-title]");
      expect(title?.textContent?.trim()).toBe("Edit Role");

      const nameInput = target.querySelector<HTMLInputElement>("input[name=roleName]");
      expect(nameInput?.value).toBe("Content Manager");

      const descTextarea = target.querySelector<HTMLTextAreaElement>("textarea#role-description");
      expect(descTextarea?.value).toBe("Oversees publications");

      // content:read should be checked, media:delete unchecked
      const labels = [...target.querySelectorAll("label")];
      const readLabel = labels.find((l) => l.textContent?.includes("Read Content"));
      expect(readLabel).toBeDefined();
      const readInput =
        readLabel?.parentElement?.querySelector<HTMLInputElement>("input[type=checkbox]");
      expect(readInput?.checked).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("filters permissions by search query", async () => {
    const { target, cleanup } = renderComponent(RoleModal, {
      isEditMode: false,
      currentRoleId: "",
      roleName: "Tester",
      roleDescription: "",
      currentGroupName: "default",
      permissions: MOCK_PERMISSIONS,
      roles: MOCK_ROLES,
    });

    try {
      const searchInput =
        target.querySelector<HTMLInputElement>("input[placeholder*='Search']") ??
        target.querySelector<HTMLInputElement>("input.text-sm");
      expect(searchInput).toBeDefined();

      // Initially all 4 permissions are rendered
      expect(target.querySelectorAll("input[type=checkbox]").length).toBe(4);

      // Search for "media"
      await typeText(searchInput, "media");
      expect(target.querySelectorAll("input[type=checkbox]").length).toBe(1);
      expect(target.textContent).toContain("Delete Media");
      expect(target.textContent).not.toContain("Write Content");

      // Clear search
      await typeText(searchInput, "");
      expect(target.querySelectorAll("input[type=checkbox]").length).toBe(4);
    } finally {
      cleanup();
    }
  });

  it("toggles permission checkbox when clicked", async () => {
    const { target, cleanup } = renderComponent(RoleModal, {
      isEditMode: false,
      currentRoleId: "",
      roleName: "Tester",
      roleDescription: "",
      currentGroupName: "default",
      selectedPermissions: [],
      permissions: MOCK_PERMISSIONS,
      roles: MOCK_ROLES,
    });

    try {
      const labels = [...target.querySelectorAll("label")];
      const writeLabel = labels.find((l) => l.textContent?.includes("Write Content"));
      expect(writeLabel).toBeDefined();

      const checkbox =
        writeLabel?.parentElement?.querySelector<HTMLInputElement>("input[type=checkbox]");
      expect(checkbox?.checked).toBe(false);

      // Toggle ON
      await click(writeLabel);
      expect(checkbox?.checked).toBe(true);

      // Toggle OFF
      await click(writeLabel);
      expect(checkbox?.checked).toBe(false);
    } finally {
      cleanup();
    }
  });

  it("copies permissions from an existing role", async () => {
    const { target, cleanup } = renderComponent(RoleModal, {
      isEditMode: false,
      currentRoleId: "new-role",
      roleName: "Copycat",
      roleDescription: "",
      currentGroupName: "default",
      selectedPermissions: [],
      permissions: MOCK_PERMISSIONS,
      roles: MOCK_ROLES,
    });

    try {
      // Find copy select element
      const select = target.querySelector<HTMLSelectElement>("select");
      expect(select).toBeDefined();

      // Select editor-role
      if (select) {
        select.value = "editor-role";
        select.dispatchEvent(new Event("change", { bubbles: true }));
        await settle();
      }

      // Editor role permissions are content:read and content:write
      const labels = [...target.querySelectorAll("label")];
      const readLabel = labels.find((l) => l.textContent?.includes("Read Content"));
      const writeLabel = labels.find((l) => l.textContent?.includes("Write Content"));
      const deleteLabel = labels.find((l) => l.textContent?.includes("Delete Media"));

      const readInput =
        readLabel?.parentElement?.querySelector<HTMLInputElement>("input[type=checkbox]");
      const writeInput =
        writeLabel?.parentElement?.querySelector<HTMLInputElement>("input[type=checkbox]");
      const deleteInput =
        deleteLabel?.parentElement?.querySelector<HTMLInputElement>("input[type=checkbox]");

      expect(readInput?.checked).toBe(true);
      expect(writeInput?.checked).toBe(true);
      expect(deleteInput?.checked).toBe(false);
    } finally {
      cleanup();
    }
  });

  it("blocks submission when role name is blank", async () => {
    const close = vi.fn();
    const { target, cleanup } = renderComponent(RoleModal, {
      isEditMode: false,
      currentRoleId: "",
      roleName: "   ",
      roleDescription: "",
      currentGroupName: "default",
      close,
      permissions: MOCK_PERMISSIONS,
      roles: MOCK_ROLES,
    });

    try {
      const form = target.querySelector<HTMLFormElement>("form#roleForm");
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await settle();

      expect(close).not.toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });

  it("submits trimmed role payload to the close handler on valid submit", async () => {
    const close = vi.fn();
    const { target, cleanup } = renderComponent(RoleModal, {
      isEditMode: true,
      currentRoleId: "custom-role-1",
      roleName: "Initial Name",
      roleDescription: "Initial Desc",
      currentGroupName: "management",
      selectedPermissions: ["content:read"],
      close,
      permissions: MOCK_PERMISSIONS,
      roles: MOCK_ROLES,
    });

    try {
      const nameInput = target.querySelector<HTMLInputElement>("input[name=roleName]");
      const descTextarea = target.querySelector<HTMLTextAreaElement>("textarea#role-description");

      await typeText(nameInput, "Updated Role Name");
      await typeText(descTextarea, "Updated description for role");

      const form = target.querySelector<HTMLFormElement>("form#roleForm");
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await settle();

      expect(close).toHaveBeenCalledTimes(1);
      expect(close).toHaveBeenCalledWith({
        roleName: "Updated Role Name",
        roleDescription: "Updated description for role",
        currentGroupName: "management",
        selectedPermissions: ["content:read"],
        currentRoleId: "custom-role-1",
      });
    } finally {
      cleanup();
    }
  });

  it("dismisses with false on cancel button click", async () => {
    const close = vi.fn();
    const { target, cleanup } = renderComponent(RoleModal, {
      isEditMode: false,
      currentRoleId: "",
      roleName: "Discard Me",
      roleDescription: "",
      currentGroupName: "default",
      close,
      permissions: MOCK_PERMISSIONS,
      roles: MOCK_ROLES,
    });

    try {
      const buttons = [...target.querySelectorAll("button")];
      const cancelBtn = buttons.find((b) => b.textContent?.trim().toLowerCase().includes("cancel"));
      expect(cancelBtn).toBeDefined();

      await click(cancelBtn);

      expect(close).toHaveBeenCalledWith(false);
    } finally {
      cleanup();
    }
  });
});
