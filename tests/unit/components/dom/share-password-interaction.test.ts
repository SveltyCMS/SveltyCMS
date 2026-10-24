/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/share-password-interaction.test.ts
 * @description Unlock flow on the public share landing page.
 *
 * The server returns `{ success, data: { passwordRequired } }` for a wrong
 * password. The page used to read `body.passwordRequired` (always undefined)
 * and treated every wrong password as a successful unlock. These interactions
 * pin the envelope contract: wrong → inline error, correct → success toast and
 * navigation to the download URL.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SharePage from "@src/routes/share/[token]/+page.svelte";
import { toast } from "@src/stores/toast.svelte.ts";
import { renderPage, settle, typeText } from "./render";

const BASE_DATA = {
  token: "share-token-abc",
  mediaId: "media_share_1",
  filename: "quarterly-report.pdf",
  size: 4096,
  type: "document",
  mimeType: "application/pdf",
  url: "/files/quarterly-report.pdf",
  passwordRequired: true,
};

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function submit(form: HTMLFormElement | null): Promise<void> {
  if (!form) throw new Error("password form not found");
  form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
  await settle();
}

describe("Share page — password unlock", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    toast.clear();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { href: "" } as Location,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    toast.clear();
  });

  it("shows an inline error for a wrong password and does not navigate", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        data: { passwordRequired: true },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { target, cleanup } = renderPage(SharePage, BASE_DATA);
    try {
      const input = target.querySelector<HTMLInputElement>('input[type="password"]');
      expect(input).toBeInTheDocument();

      await typeText(input, "wrong-horse");
      await submit(target.querySelector("form"));

      await vi.waitFor(() => {
        const alert = target.querySelector('[role="alert"]');
        expect(alert?.textContent).toContain("Incorrect password");
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0]?.[0])).toContain("password=wrong-horse");
      expect((window.location as { href: string }).href).toBe("");
      expect(toast.toasts.some((item) => item.type === "success")).toBe(false);
    } finally {
      cleanup();
    }
  });

  it("navigates to the download URL for the correct password", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: {} }));
    vi.stubGlobal("fetch", fetchMock);

    const { target, cleanup } = renderPage(SharePage, BASE_DATA);
    try {
      const input = target.querySelector<HTMLInputElement>('input[type="password"]');
      expect(input).toBeInTheDocument();

      await typeText(input, "correct-horse");
      await submit(target.querySelector("form"));

      await vi.waitFor(() => {
        expect(
          toast.toasts.some(
            (item) => item.type === "success" && /password verified/i.test(item.message),
          ),
        ).toBe(true);
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0]?.[0])).toContain("password=correct-horse");
      expect((window.location as { href: string }).href).toContain(
        "/api/media/share?id=media_share_1&token=share-token-abc&password=correct-horse",
      );
    } finally {
      cleanup();
    }
  });
});
