/**
 * @file tests/unit/api/marketplace-utility.test.ts
 * @description `GET /api/marketplace` proxy contract (CB2).
 *
 * The collection-builder palette used to call marketplace.sveltycms.com directly
 * from the browser and failed CORS. It now reads this same-origin proxy, so the
 * proxy payload must keep the shape the palette maps: `{ items: [{ id, name,
 * description, version }] }` inside the standard success envelope.
 *
 * Only the marketplace service boundary is mocked.
 *
 * ### Features tested
 * - success envelope with `source` / `remoteAvailable` / `items`
 * - `type` + `limit` forwarded to the service / applied to the payload
 * - empty catalog keeps the same shape (`items: []`)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";
import { handleUtilityRoutes } from "@src/routes/api/[...path]/handlers/utility";

const { mockList } = vi.hoisted(() => ({ mockList: vi.fn() }));

vi.mock("@src/services/core/marketplace-service", () => ({
  marketplaceService: { list: mockList },
}));

interface ProxyItem {
  id: string;
  name: string;
  description: string;
  version: string;
}

const CATALOG: ProxyItem[] = Array.from({ length: 30 }, (_, index) => ({
  id: `widget-${index}`,
  name: `Widget ${index}`,
  description: `Description ${index}`,
  version: "1.0.0",
}));

function makeEvent(path: string): RequestEvent {
  return {
    locals: { user: { _id: "admin-1", role: "admin", isAdmin: true } },
    url: new URL(`http://localhost${path}`),
    request: { method: "GET", headers: new Headers() },
  } as unknown as RequestEvent;
}

async function get(path: string) {
  const response = await handleUtilityRoutes(makeEvent(path), {} as never, "tenant-1" as never, [
    "marketplace",
  ]);
  return { status: response.status, body: await response.json() };
}

describe("GET /api/marketplace (collection-builder proxy)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue({
      source: "remote",
      remoteAvailable: true,
      items: CATALOG,
    });
  });

  it("returns the catalog in the standard envelope the palette reads", async () => {
    const { status, body } = await get("/api/marketplace?type=widget&limit=24");

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.source).toBe("remote");
    expect(body.data.remoteAvailable).toBe(true);
    expect(body.data.items).toHaveLength(24);
    expect(body.data.items[0]).toMatchObject({
      id: "widget-0",
      name: "Widget 0",
      description: "Description 0",
      version: "1.0.0",
    });
    expect(mockList).toHaveBeenCalledWith({ type: "widget", search: undefined });
  });

  it("keeps the same shape for an empty catalog", async () => {
    mockList.mockResolvedValue({ source: "local", remoteAvailable: false, items: [] });

    const { status, body } = await get("/api/marketplace?type=widget&limit=24");

    expect(status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: { source: "local", remoteAvailable: false, items: [] },
    });
  });
});
