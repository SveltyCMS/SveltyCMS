/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/user-modal-edit-interaction.test.ts
 * @description Real DOM interaction tests for `ModalEditForm` on the `/user` route.
 *
 * Covers the full user-editing lifecycle in a real mounted Svelte 5 component:
 * - Own profile seeding and username update without clobbering active input
 * - Fallback to `"self"` when `page.data.user._id` is absent
 * - Validation errors on empty username
 * - Current-password verification unlock flow for own-profile password changes
 * - Admin editing another user's role + delete user action with close callback
 *
 * ### Features:
 * - own-profile username save + close callback
 * - missing `_id` fallback to `"self"`
 * - client-side Valibot validation error display
 * - password verification unlock + new password submission
 * - admin role radio group selection + user deletion
 * - ModalEditToken creation, edit, and deletion with close callback
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import ModalEditForm from "@src/routes/(app)/user/components/modal-edit-form.svelte";
import ModalEditToken from "@src/routes/(app)/user/components/modal-edit-token.svelte";
import { page } from "$app/state";
import { refreshAll } from "$app/navigation";
import { click, renderComponent, select, settle, typeText } from "./render";

const h = vi.hoisted(() => ({
  updateProfile: vi.fn(),
  verifyPassword: vi.fn(),
  deleteUser: vi.fn(),
  modalClose: vi.fn(),
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@src/routes/(app)/user/user.remote", () => ({
  updateProfile: h.updateProfile,
  verifyPassword: h.verifyPassword,
  deleteUser: h.deleteUser,
}));

vi.mock("@utils/modal.svelte", () => ({
  modalState: {
    close: h.modalClose,
  },
}));

vi.mock("@src/stores/toast.svelte.ts", () => ({
  toast: h.toast,
}));

const ROLES = [
  { _id: "admin", name: "Administrator", isAdmin: true },
  { _id: "editor", name: "Editor", isAdmin: false },
];

beforeEach(() => {
  h.updateProfile.mockReset().mockResolvedValue({ success: true });
  h.verifyPassword.mockReset().mockResolvedValue({ valid: true });
  h.deleteUser.mockReset().mockResolvedValue({ success: true, message: "Deleted" });
  h.modalClose.mockReset();
  for (const fn of Object.values(h.toast)) fn.mockReset();
  (refreshAll as unknown as ReturnType<typeof vi.fn>).mockClear?.();

  page.data = {
    user: {
      _id: "user-admin-1",
      username: "admin_original",
      email: "admin@example.com",
      role: "admin",
      isAdmin: true,
    },
    roles: ROLES,
    isFirstUser: false,
  };
});

describe("ModalEditForm (client interaction)", () => {
  it("seeds own profile data, preserves typed username, and saves via updateProfile", async () => {
    const close = vi.fn();
    const { target, cleanup } = renderComponent(ModalEditForm, { close });

    try {
      const usernameInput = target.querySelector<HTMLInputElement>('input[name="username"]');
      const emailInput = target.querySelector<HTMLInputElement>('input[name="email"]');
      expect(usernameInput).toBeInTheDocument();
      expect(usernameInput?.value).toBe("admin_original");
      expect(emailInput).toBeDisabled();
      expect(emailInput?.value).toBe("admin@example.com");

      await typeText(usernameInput, "admin_renamed");
      expect(usernameInput?.value).toBe("admin_renamed");

      const form = target.querySelector<HTMLFormElement>("#change_user_form");
      form?.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
      await settle();

      await vi.waitFor(() => expect(h.updateProfile).toHaveBeenCalledTimes(1));
      expect(h.updateProfile).toHaveBeenCalledWith({
        user_id: "self",
        username: "admin_renamed",
        email: "admin@example.com",
      });
      expect(h.toast.success).toHaveBeenCalledTimes(1);
      expect(close).toHaveBeenCalledWith({ success: true });
    } finally {
      cleanup();
    }
  });

  it("falls back to user_id 'self' and still validates when page.data.user._id is missing", async () => {
    page.data = {
      user: {
        username: "editor_no_id",
        email: "editor@example.com",
        role: "editor",
        isAdmin: false,
      },
      roles: ROLES,
      isFirstUser: false,
    };

    const { target, cleanup } = renderComponent(ModalEditForm);

    try {
      const usernameInput = target.querySelector<HTMLInputElement>('input[name="username"]');
      await typeText(usernameInput, "editor_updated");

      const form = target.querySelector<HTMLFormElement>("#change_user_form");
      form?.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
      await settle();

      await vi.waitFor(() => expect(h.updateProfile).toHaveBeenCalledTimes(1));
      expect(h.updateProfile).toHaveBeenCalledWith({
        user_id: "self",
        username: "editor_updated",
        email: "editor@example.com",
      });
      expect(h.modalClose).toHaveBeenCalledWith({ success: true });
    } finally {
      cleanup();
    }
  });

  it("blocks submission and displays validation error when username is too short", async () => {
    const { target, cleanup } = renderComponent(ModalEditForm);

    try {
      const usernameInput = target.querySelector<HTMLInputElement>('input[name="username"]');
      await typeText(usernameInput, "a");

      const form = target.querySelector<HTMLFormElement>("#change_user_form");
      form?.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
      await settle();

      expect(h.updateProfile).not.toHaveBeenCalled();
      expect(usernameInput).toHaveAttribute("aria-invalid", "true");
      expect(target.querySelector('[role="alert"]')).toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it("unlocks new password fields after verifying current password on blur", async () => {
    const { target, cleanup } = renderComponent(ModalEditForm);

    try {
      const currentPwInput = target.querySelector<HTMLInputElement>(
        'input[name="current_password"]',
      );
      const newPwInput = target.querySelector<HTMLInputElement>('input[name="security"]');
      const confirmPwInput = target.querySelector<HTMLInputElement>(
        'input[name="confirm_password"]',
      );

      expect(currentPwInput).toBeInTheDocument();
      expect(newPwInput).toBeDisabled();
      expect(confirmPwInput).toBeDisabled();

      await typeText(currentPwInput, "CurrentPass123!");
      currentPwInput?.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
      await settle();

      await vi.waitFor(() => expect(h.verifyPassword).toHaveBeenCalledWith("CurrentPass123!"));
      await vi.waitFor(() => expect(newPwInput).toBeEnabled());
      expect(confirmPwInput).toBeEnabled();

      await typeText(newPwInput, "NewStrongPass123!");
      await typeText(confirmPwInput, "NewStrongPass123!");

      const form = target.querySelector<HTMLFormElement>("#change_user_form");
      form?.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
      await settle();

      await vi.waitFor(() => expect(h.updateProfile).toHaveBeenCalledTimes(1));
      expect(h.updateProfile).toHaveBeenCalledWith({
        user_id: "self",
        username: "admin_original",
        email: "admin@example.com",
        password: "NewStrongPass123!",
        currentPassword: "CurrentPass123!",
      });
    } finally {
      cleanup();
    }
  });

  it("allows admin to change another user's role and delete the user", async () => {
    const close = vi.fn();
    const { target, cleanup } = renderComponent(ModalEditForm, {
      isGivenData: true,
      user_id: "user-other-2",
      username: "bob_user",
      email: "bob@example.com",
      role: "editor",
      close,
    });

    try {
      // Current password input is not rendered when admin edits another user
      expect(target.querySelector('input[name="current_password"]')).not.toBeInTheDocument();

      // Role radio buttons are rendered
      const radios = target.querySelectorAll<HTMLButtonElement>('[role="radio"]');
      expect(radios.length).toBe(2);
      const adminRadio = Array.from(radios).find((r) =>
        r.textContent?.toLowerCase().includes("administrator"),
      );
      await click(adminRadio);

      const form = target.querySelector<HTMLFormElement>("#change_user_form");
      form?.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
      await settle();

      await vi.waitFor(() => expect(h.updateProfile).toHaveBeenCalledTimes(1));
      expect(h.updateProfile).toHaveBeenCalledWith({
        user_id: "user-other-2",
        username: "bob_user",
        email: "bob@example.com",
        role: "admin",
      });
      expect(close).toHaveBeenCalledWith({ success: true });

      // Also verify delete button triggers deleteUser and close({ success: true })
      close.mockClear();
      const buttons = Array.from(target.querySelectorAll<HTMLButtonElement>("footer button"));
      const deleteBtn = buttons.find((b) => b.textContent?.toLowerCase().includes("delete"));
      expect(deleteBtn).toBeInTheDocument();
      await click(deleteBtn);

      await vi.waitFor(() => expect(h.deleteUser).toHaveBeenCalledWith(["user-other-2"]));
      expect(close).toHaveBeenCalledWith({ success: true });
    } finally {
      cleanup();
    }
  });
});

describe("ModalEditToken (client interaction)", () => {
  it("edits an existing token with converted legacy expiry and invokes close({ success: true })", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const close = vi.fn();

    const { target, cleanup } = renderComponent(ModalEditToken, {
      token: "tok-id-1",
      user_id: "u-1",
      email: "invitee@example.com",
      role: "editor",
      expires: "7d",
      roles: ROLES,
      close,
    });

    try {
      const emailInput = target.querySelector<HTMLInputElement>('input[name="email"]');
      const expiresSelect = target.querySelector<HTMLSelectElement>("#expires-select");
      expect(emailInput?.value).toBe("invitee@example.com");
      expect(expiresSelect?.value).toBe("1 week");

      await select(expiresSelect, "2 days");

      const form = target.querySelector<HTMLFormElement>("#token-form");
      form?.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
      await settle();

      await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
      const [endpoint, init] = fetchSpy.mock.calls[0];
      expect(endpoint).toBe("/api/token/tok-id-1");
      expect(init?.method).toBe("PUT");
      const parsedBody = JSON.parse(String(init?.body));
      expect(parsedBody.newTokenData.email).toBe("invitee@example.com");
      expect(parsedBody.newTokenData.role).toBe("editor");
      expect(typeof parsedBody.newTokenData.expires).toBe("string");
      await vi.waitFor(() => expect(close).toHaveBeenCalledWith({ success: true }));
    } finally {
      fetchSpy.mockRestore();
      cleanup();
    }
  });

  it("deletes an existing token and invokes close({ success: true })", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { deletedCount: 1 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const close = vi.fn();

    const { target, cleanup } = renderComponent(ModalEditToken, {
      token: "tok-id-2",
      email: "delete-me@example.com",
      role: "editor",
      roles: ROLES,
      close,
    });

    try {
      const buttons = Array.from(target.querySelectorAll<HTMLButtonElement>("footer button"));
      const deleteBtn = buttons.find((b) => b.textContent?.toLowerCase().includes("delete"));
      expect(deleteBtn).toBeInTheDocument();

      await click(deleteBtn);

      await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
      const [endpoint, init] = fetchSpy.mock.calls[0];
      expect(endpoint).toBe("/api/token/tok-id-2");
      expect(init?.method).toBe("DELETE");
      await vi.waitFor(() => expect(close).toHaveBeenCalledWith({ success: true }));
    } finally {
      fetchSpy.mockRestore();
      cleanup();
    }
  });
});
