/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/webhook-logs-interaction.test.ts
 * @description Real DOM tests for `/config/webhooks/logs` (F6).
 *
 * Regression: an empty delivery log is a normal state. The page must render its
 * empty card without a red error toast — the old handler answered 404 for the
 * list endpoint, so a quiet tenant saw "Webhook logs not found".
 *
 * Only the HTTP boundary (`fetchApi`) and the toast service are mocked.
 *
 * ### Features:
 * - empty list → empty state, no error toast
 * - failed request → error card + toast
 * - failed delivery renders the DLQ row and requeues on retry
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import LogsPage from "@src/routes/(app)/config/webhooks/logs/+page.svelte";
import { click, renderPage, settle } from "./render";

const h = vi.hoisted(() => ({
  fetchApi: vi.fn(),
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@utils/http-client", () => ({ fetchApi: h.fetchApi }));
vi.mock("@src/stores/toast.svelte.ts", () => ({ toast: h.toast }));

const FAILED_LOG = {
  _id: "job-1",
  webhookId: "hook-1",
  webhookName: "Deploy Hook",
  event: "entry:publish",
  status: "failed",
  attempts: 3,
  maxAttempts: 3,
  lastError: "PERMANENT_FAILURE: HTTP 410",
  createdAt: "2026-11-01T10:00:00.000Z",
  updatedAt: "2026-11-01T10:00:05.000Z",
};

async function mount() {
  const rendered = renderPage(LogsPage, { isAdmin: true });
  await settle();
  await vi.waitFor(() =>
    expect(
      rendered.target.querySelector("[data-testid='webhook-logs-loading']") ??
        rendered.target.querySelector("[data-testid='webhook-logs-empty']") ??
        rendered.target.querySelector("[data-testid='webhook-logs-error']") ??
        rendered.target.querySelector("[data-testid='webhook-logs-table']"),
    ).not.toBeNull(),
  );
  return rendered;
}

beforeEach(() => {
  h.fetchApi.mockReset();
  for (const fn of Object.values(h.toast)) fn.mockReset();
});

describe("Webhook logs page (client interaction)", () => {
  it("renders the empty state for an empty list without an error toast", async () => {
    h.fetchApi.mockResolvedValue({ success: true, data: [] });

    const { target, cleanup } = await mount();
    try {
      expect(h.fetchApi).toHaveBeenCalledWith("/api/webhooks/logs");
      expect(target.querySelector("[data-testid='webhook-logs-empty']")).not.toBeNull();
      expect(target.querySelector("[data-testid='webhook-logs-error']")).toBeNull();
      expect(h.toast.error).not.toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });

  it("shows an error card (not the empty state) when the request fails", async () => {
    h.fetchApi.mockResolvedValue({ success: false, message: "Server exploded" });

    const { target, cleanup } = await mount();
    try {
      expect(target.querySelector("[data-testid='webhook-logs-error']")).not.toBeNull();
      expect(target.querySelector("[data-testid='webhook-logs-empty']")).toBeNull();
      expect(h.toast.error).toHaveBeenCalledWith("Server exploded");
    } finally {
      cleanup();
    }
  });

  it("lists a failed delivery and requeues it on retry", async () => {
    h.fetchApi.mockResolvedValueOnce({ success: true, data: [FAILED_LOG] });
    h.fetchApi.mockResolvedValueOnce({ success: true, data: { success: true } });
    h.fetchApi.mockResolvedValueOnce({ success: true, data: [FAILED_LOG] });

    const { target, cleanup } = await mount();
    try {
      const table = target.querySelector("[data-testid='webhook-logs-table']");
      expect(table).not.toBeNull();
      expect(table?.textContent).toContain("Deploy Hook");
      expect(table?.textContent).toContain("entry:publish");

      const retry = [...(table?.querySelectorAll("button") ?? [])].find((button) =>
        /retry/i.test(button.textContent ?? ""),
      );
      await click(retry);

      await vi.waitFor(() =>
        expect(h.fetchApi).toHaveBeenCalledWith("/api/webhooks/logs/job-1/retry", {
          method: "POST",
        }),
      );
      expect(h.toast.success).toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });
});
