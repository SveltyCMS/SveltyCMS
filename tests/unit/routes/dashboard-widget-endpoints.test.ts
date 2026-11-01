/**
 * @file tests/unit/routes/dashboard-widget-endpoints.test.ts
 * @description Dashboard widgets fetch a `dashboard` action by NAME; an action the
 * handler does not implement answers 404 (`Dashboard action '<x>' not
 * implemented`) and the widget renders empty. The "Last 5 Content" widget pointed
 * at `/api/dashboard/last5` while the handler implements `last5-content`.
 *
 * Exercised through the handler itself (request in, JSON/404 out) rather than by
 * grepping the handler and widget sources for matching strings.
 */

import { describe, expect, it, vi } from "vitest";
import { handleDashboardRoutes } from "../../../src/routes/api/[...path]/handlers/dashboard";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";

const TENANT = "t1" as DatabaseId;

function fakeEvent(action: string) {
  const url = new URL(`http://localhost/api/dashboard/${action}`);
  return { url, request: new Request(url), locals: {} } as never;
}

/** CMS stub: the widget's action is the only thing that reads it. */
function cmsWithSearch(items: unknown[]) {
  return {
    collections: {
      search: vi.fn(async () => ({ items, total: items.length, page: 1, pageSize: 5 })),
    },
  } as unknown as LocalCMS;
}

describe("last5-content dashboard widget", () => {
  it("answers the action the widget polls", async () => {
    const cms = cmsWithSearch([{ _id: "c1", title: "Hello", updatedAt: "2026-01-01" }]);

    const res = await handleDashboardRoutes(fakeEvent("last5-content"), cms, TENANT, [
      "dashboard",
      "last5-content",
    ]);

    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<Record<string, unknown>>;
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ id: "c1", title: "Hello" });
    expect(cms.collections.search).toHaveBeenCalledTimes(1);
  });

  it("answers 404 for the unimplemented bare `last5` action", async () => {
    const cms = cmsWithSearch([]);

    await expect(
      handleDashboardRoutes(fakeEvent("last5"), cms, TENANT, ["dashboard", "last5"]),
    ).rejects.toMatchObject({ status: 404 });
    // The widget would render empty either way — the difference is that this is a
    // named 404 instead of a silent empty list.
    expect(cms.collections.search).not.toHaveBeenCalled();
  });
});
