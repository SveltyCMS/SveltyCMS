/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/sign-in-forgot-password.test.ts
 * @description Regression pins for the forgot-password flow (retest N1).
 *
 * When no email provider is configured the server mints no reset token and
 * returns no `resetLink`. The component used to open the Reset Password form
 * anyway, leaving a "Save New Password" button that submitted nothing and gave
 * no feedback.
 *
 * ### Features:
 * - no reset link → forgot form stays visible, server message is surfaced
 * - dev/opt-in reset link → reset form opens with the minted token
 * - reset validation failure → toast, never a silent wiggle
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SignIn from "@src/routes/login/components/sign-in.svelte";
import { toast } from "@src/stores/toast.svelte.ts";
import { click, renderComponent, settle, typeText } from "./render";

const { forgotPW, resetPW } = vi.hoisted(() => ({
  forgotPW: vi.fn(),
  resetPW: vi.fn(),
}));

vi.mock("@src/routes/login/auth.remote", () => ({ forgotPW, resetPW }));

function forgotForm(target: HTMLElement): HTMLFormElement | null {
  return target.querySelector<HTMLFormElement>("form[aria-label='Forgot password']");
}

function resetForm(target: HTMLElement): HTMLFormElement | null {
  return target.querySelector<HTMLFormElement>("form[aria-label='Reset password']");
}

async function openForgotForm(target: HTMLElement): Promise<void> {
  await click(target.querySelector("[data-testid='signin-forgot-password']"));
  await settle();
  expect(forgotForm(target)).not.toBeNull();
}

async function submitForgotForm(target: HTMLElement): Promise<void> {
  const emailInput = target.querySelector<HTMLInputElement>("#emailforgot");
  await typeText(emailInput, "editor@example.com");
  const submit = forgotForm(target)?.querySelector<HTMLButtonElement>("button[type='submit']");
  await click(submit);
}

beforeEach(() => {
  forgotPW.mockReset();
  resetPW.mockReset();
  toast.clear();
});

afterEach(() => {
  toast.clear();
});

describe("SignIn — forgot password (retest N1)", () => {
  it("keeps the forgot form and surfaces the server message when no reset link exists", async () => {
    const message =
      "Password reset by email is unavailable because no email provider is configured. Ask an administrator to set a new password for you.";
    forgotPW.mockResolvedValue({
      success: true,
      smtpConfigured: false,
      message,
      resetLink: undefined,
    });

    const rendered = renderComponent(SignIn, { active: 0 });
    try {
      await openForgotForm(rendered.target);
      await submitForgotForm(rendered.target);

      await vi.waitFor(() => {
        expect(
          rendered.target.querySelector("[data-testid='forgot-password-notice']")?.textContent,
        ).toContain("no email provider is configured");
      });

      expect(forgotForm(rendered.target)).not.toBeNull();
      expect(resetForm(rendered.target)).toBeNull();
    } finally {
      rendered.cleanup();
    }
  });

  it("opens the reset form only when the server returns a reset link", async () => {
    forgotPW.mockResolvedValue({
      success: true,
      smtpConfigured: false,
      message: "SMTP not configured — use the link below to reset your password.",
      resetLink: "http://localhost/login?token=token-abc&email=editor%40example.com",
    });

    const rendered = renderComponent(SignIn, { active: 0 });
    try {
      await openForgotForm(rendered.target);
      await submitForgotForm(rendered.target);

      await vi.waitFor(() => {
        expect(resetForm(rendered.target)).not.toBeNull();
      });

      const tokenInput = rendered.target.querySelector<HTMLInputElement>(
        "form[aria-label='Reset password'] input[name='token']",
      );
      expect(tokenInput?.value).toBe("token-abc");
      expect(forgotForm(rendered.target)).toBeNull();
    } finally {
      rendered.cleanup();
    }
  });

  it("reports reset-form validation failures as a toast and sends no request", async () => {
    forgotPW.mockResolvedValue({
      success: true,
      smtpConfigured: false,
      resetLink: "http://localhost/login?token=token-abc&email=editor%40example.com",
    });

    const rendered = renderComponent(SignIn, { active: 0 });
    try {
      await openForgotForm(rendered.target);
      await submitForgotForm(rendered.target);
      await vi.waitFor(() => {
        expect(resetForm(rendered.target)).not.toBeNull();
      });

      const saveButton = rendered.target.querySelector<HTMLButtonElement>(
        "form[aria-label='Reset password'] button[type='submit']",
      );
      await click(saveButton);

      await vi.waitFor(() => {
        expect(toast.toasts.some((entry) => entry.title === "Password not saved")).toBe(true);
      });
      expect(resetPW).not.toHaveBeenCalled();
    } finally {
      rendered.cleanup();
    }
  });

  it("answers a rejected reset request with an error toast", async () => {
    forgotPW.mockResolvedValue({ success: false, message: "Too many requests." });

    const rendered = renderComponent(SignIn, { active: 0 });
    try {
      await openForgotForm(rendered.target);
      await submitForgotForm(rendered.target);

      await vi.waitFor(() => {
        expect(
          rendered.target.querySelector("[data-testid='forgot-password-notice']")?.textContent,
        ).toContain("Too many requests.");
      });
      expect(resetForm(rendered.target)).toBeNull();
    } finally {
      rendered.cleanup();
    }
  });
});
