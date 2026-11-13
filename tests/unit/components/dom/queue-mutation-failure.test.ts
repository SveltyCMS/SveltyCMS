/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/queue-mutation-failure.test.ts
 * @description Queue mutations surface `success: false` as an error toast
 * instead of silently ignoring the failed write.
 *
 * The clear-completed / delete / retry handlers only ever branched on
 * `result.success` being truthy; a `success: false` envelope produced no toast
 * and no refresh, so the operator saw no feedback while the write was ignored.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import QueuePage from "@src/routes/(app)/config/queue/+page.svelte";
import { click, renderPage, settle, type RenderedComponent } from "./render";

const remote = vi.hoisted(() => ({
  clearCompleted: vi.fn(),
  deleteJob: vi.fn(),
  retryJob: vi.fn(),
}));

vi.mock("@src/routes/(app)/config/queue/queue.remote", () => remote);

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@src/stores/toast.svelte.ts", () => ({ toast: toastMock }));

const modal = vi.hoisted(() => ({
  showConfirm: vi.fn((options: { onConfirm?: () => void }) => options.onConfirm?.()),
}));

vi.mock("@utils/modal.svelte", () => modal);

vi.mock("$app/state", () => ({
  page: {
    url: new URL("http://localhost/config/queue"),
    params: {},
    route: { id: "/config/queue" },
    status: 200,
    error: null,
    data: {},
    form: null,
  },
}));

const DATA = {
  jobs: [
    {
      _id: "job-1",
      taskType: "publish-scheduled",
      status: "failed",
      attempts: 3,
      maxAttempts: 3,
      lastError: "boom",
      nextRunAt: null,
      createdAt: "2026-10-25T18:00:00.000Z",
      updatedAt: "2026-10-25T18:00:01.000Z",
      payload: {},
    },
  ],
  totalCount: 1,
  stats: { total: 1, pending: 0, running: 0, completed: 1, failed: 0 },
  pagination: { limit: 25, offset: 0 },
};

describe("Queue mutation failure feedback", () => {
  let rendered: RenderedComponent | null = null;

  afterEach(() => {
    rendered?.cleanup();
    rendered = null;
    remote.clearCompleted.mockReset();
    remote.deleteJob.mockReset();
    remote.retryJob.mockReset();
    toastMock.success.mockReset();
    toastMock.error.mockReset();
  });

  it("shows an error toast when clear-completed returns success:false", async () => {
    remote.clearCompleted.mockResolvedValue({ success: false });
    rendered = renderPage(QueuePage, DATA);
    await settle();

    await click(rendered.target.querySelector('[data-testid="queue-clear-completed"]'));
    await vi.waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it("shows an error toast when delete returns success:false", async () => {
    remote.deleteJob.mockResolvedValue({ success: false });
    rendered = renderPage(QueuePage, DATA);
    await settle();

    await click(rendered.target.querySelector('[data-testid="queue-job-delete"]'));
    await vi.waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it("shows an error toast when retry returns success:false", async () => {
    remote.retryJob.mockResolvedValue({ success: false });
    rendered = renderPage(QueuePage, DATA);
    await settle();

    const retry = rendered.target.querySelector<HTMLButtonElement>(
      'button[class*="preset-filled-primary-500"]',
    );
    expect(retry).toBeTruthy();
    await click(retry);
    await vi.waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(toastMock.success).not.toHaveBeenCalled();
  });
});
