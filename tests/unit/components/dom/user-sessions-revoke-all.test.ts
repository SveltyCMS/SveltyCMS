/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/user-sessions-revoke-all.test.ts
 * @description Regression pin for the admin "Revoke All Sessions" action.
 *
 * The handler awaited every DELETE with `.catch(() => {})`, so an HTTP error
 * (403/500) never rejected, the failed session rows were discarded and a
 * success toast claimed every session was revoked while they were still
 * active. Revoking sessions is a security action: a partial failure must keep
 * the failed rows visible and report the error.
 *
 * ### Features:
 * - a rejected/HTTP-error DELETE keeps the session row and shows an error
 * - no success toast is shown when nothing was revoked
 * - the all-succeeded path still clears the list and shows success
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import UserSessionsModal from "@src/routes/(app)/user/components/modal-user-sessions.svelte";
import type { User } from "@src/databases/auth/types";
import { nowISODateString } from "@utils/date";
import { usersessions_revoke_all } from "@src/paraglide/messages";
import { click, renderComponent, settle } from "./render";

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}));

vi.mock("@src/stores/toast.svelte.ts", () => ({ toast: toastMock }));

const modalMock = vi.hoisted(() => ({
  showConfirm: vi.fn(),
  modalState: { close: vi.fn(), trigger: vi.fn(), active: null },
}));

vi.mock("@utils/modal.svelte", () => modalMock);

const USER = {
  _id: "user-1" as User["_id"],
  username: "alice",
  email: "alice@example.com",
  role: "admin",
  permissions: [],
  createdAt: nowISODateString(),
  updatedAt: nowISODateString(),
} satisfies User;

const SESSIONS = [
  {
    _id: "session-1",
    ip: "198.51.100.1",
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) Firefox/130.0",
    lastAccess: "2026-11-12T09:00:00.000Z",
  },
  {
    _id: "session-2",
    ip: "198.51.100.2",
    userAgent: "Mozilla/5.0 (Macintosh) Safari/605.1.15",
    lastAccess: "2026-11-12T08:00:00.000Z",
  },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function revokeAllButton(target: HTMLElement): HTMLButtonElement {
  const expected = usersessions_revoke_all();
  const button = [...target.querySelectorAll("button")].find((candidate) =>
    candidate.textContent?.includes(expected),
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`revoke-all button not rendered (expected text: ${expected})`);
  }
  return button;
}

describe("User sessions modal — revoke all (client interaction)", () => {
  beforeEach(() => {
    for (const fn of Object.values(toastMock)) fn.mockReset();
    modalMock.showConfirm.mockReset();
    modalMock.showConfirm.mockResolvedValue(true);
  });

  it("keeps active sessions and reports an error when every revoke fails", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/user/sessions?") && init?.method !== "DELETE") {
        return jsonResponse({ data: { sessions: SESSIONS } });
      }
      return jsonResponse({ message: "Revoke failed" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    const rendered = renderComponent(UserSessionsModal, { user: USER });
    try {
      await vi.waitFor(() => expect(rendered.target.textContent).toContain("198.51.100.1"));

      await click(revokeAllButton(rendered.target));
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
      await settle();

      expect(toastMock.success).not.toHaveBeenCalled();
      expect(toastMock.error).toHaveBeenCalled();

      // The sessions are still active, so the rows must stay visible.
      expect(rendered.target.textContent).toContain("198.51.100.1");
      expect(rendered.target.textContent).toContain("198.51.100.2");
    } finally {
      rendered.cleanup();
      vi.unstubAllGlobals();
    }
  });

  it("clears the list and reports success when every revoke succeeds", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/user/sessions?") && init?.method !== "DELETE") {
        return jsonResponse({ data: { sessions: SESSIONS } });
      }
      return jsonResponse({ success: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    const rendered = renderComponent(UserSessionsModal, { user: USER });
    try {
      await vi.waitFor(() => expect(rendered.target.textContent).toContain("198.51.100.1"));

      await click(revokeAllButton(rendered.target));
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
      await settle();

      expect(toastMock.success).toHaveBeenCalledTimes(1);
      expect(toastMock.error).not.toHaveBeenCalled();
      expect(rendered.target.textContent).not.toContain("198.51.100.1");
    } finally {
      rendered.cleanup();
      vi.unstubAllGlobals();
    }
  });
});
