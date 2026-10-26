/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/queue-table-alignment.test.ts
 * @description Queue table uses the shared centered chrome and a single scroller.
 *
 * Two regressions lived here: the page scrolled while `SmartTableShell` scrolled the
 * table body (two vertical scrollbars), and every header re-overrode the centered
 * `SMART_TABLE_TH` tokens with `text-start!` while the status/action groups pinned
 * their content to the edges.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import QueuePage from "@src/routes/(app)/config/queue/+page.svelte";
import { click, renderPage, settle, type RenderedComponent } from "./render";

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
      _id: "01a17413aa9d7b0f2c000001",
      taskType: "publish-scheduled",
      status: "completed",
      attempts: 1,
      maxAttempts: 3,
      lastError: null,
      nextRunAt: null,
      createdAt: "2026-10-25T18:00:00.000Z",
      updatedAt: "2026-10-25T18:00:01.000Z",
      payload: { source: "queue-alignment.test" },
    },
  ],
  totalCount: 1,
  stats: { total: 1, pending: 0, running: 0, completed: 1, failed: 0 },
  pagination: { limit: 25, offset: 0 },
};

describe("Queue table chrome", () => {
  let rendered: RenderedComponent | null = null;

  afterEach(() => {
    rendered?.cleanup();
    rendered = null;
  });

  it("keeps header labels and cell groups centered", async () => {
    rendered = renderPage(QueuePage, DATA);
    await settle();

    const headers = Array.from(rendered.target.querySelectorAll("thead th"));
    expect(headers.length).toBe(7);
    for (const th of headers) {
      expect(th.className, `header "${th.textContent}"`).toContain("text-center");
      expect(th.className).not.toContain("text-start!");
      expect(th.className).not.toContain("text-end!");
    }

    // Status + action cells centre their content instead of anchoring to an edge.
    const groups = Array.from(
      rendered.target.querySelectorAll("tbody tr > td > div"),
    ) as HTMLElement[];
    expect(groups.length).toBeGreaterThanOrEqual(2);
    for (const group of groups) {
      expect(group.className).toContain("justify-center");
      expect(group.className).not.toContain("justify-end");
      expect(group.className).not.toContain("justify-start");
    }
  });

  it("owns exactly one scroll region: the table body", async () => {
    rendered = renderPage(QueuePage, DATA);
    await settle();

    // `fullHeight` turns the shell into a clipped flex column …
    const shell = rendered.target.querySelector<HTMLElement>(".admin-theme-container");
    expect(shell?.className).toContain("overflow-hidden");
    expect(shell?.className).not.toContain("overflow-y-auto");

    // … and SmartTableShell is the single scroller.
    const scroller = rendered.target.querySelector<HTMLElement>(".table-container");
    expect(scroller?.className).toContain("overflow-auto");
    expect(scroller?.className).toContain("flex-1");
  });

  it("opens a detail dialog from a row click with payload and task explanation", async () => {
    rendered = renderPage(QueuePage, DATA);
    await settle();

    const row = rendered.target.querySelector<HTMLElement>('[data-testid="queue-job-row"]');
    if (!row) throw new Error("job row not rendered");
    await click(row);
    await settle();

    const dialog = document.querySelector("dialog");
    const text = dialog?.textContent ?? "";
    expect(text).toContain("Job details");
    expect(text).toContain("publish-scheduled");
    // The handler explanation is what turns “completed in 0ms” into something readable.
    expect(text).toContain("Publishes entries whose scheduled time has passed");
    expect(text).toContain('"source": "queue-alignment.test"');
  });
});
