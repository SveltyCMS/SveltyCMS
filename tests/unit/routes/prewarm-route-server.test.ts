/**
 * @file tests/unit/routes/prewarm-route-server.test.ts
 * @description Unit tests for GET /api/system/prewarm-route endpoint.
 */

import { describe, it, expect, vi } from "vitest";
import { GET } from "@src/routes/api/system/prewarm-route/+server";
import { routeResourceStateMachine } from "@src/services/core/route-resource-state-machine";

describe("GET /api/system/prewarm-route", () => {
  it("pre-warms route resources and returns JSON route spec", async () => {
    const prewarmSpy = vi
      .spyOn(routeResourceStateMachine, "prewarmRouteResources")
      .mockResolvedValue(undefined);

    const mockUrl = new URL("http://localhost:5173/api/system/prewarm-route?path=%2Fdashboard");
    const event = {
      url: mockUrl,
      request: new Request(mockUrl),
      locals: {},
    } as any;

    const response = await GET(event);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.path).toBe("/dashboard");
    expect(data.lane).toBe("dashboard");
    expect(Array.isArray(data.requiredCacheCategories)).toBe(true);

    expect(prewarmSpy).toHaveBeenCalledWith("/dashboard", "http://localhost:5173");

    prewarmSpy.mockRestore();
  });

  it("defaults to /dashboard when path is omitted", async () => {
    const prewarmSpy = vi
      .spyOn(routeResourceStateMachine, "prewarmRouteResources")
      .mockResolvedValue(undefined);

    const mockUrl = new URL("http://localhost:5173/api/system/prewarm-route");
    const event = {
      url: mockUrl,
      request: new Request(mockUrl),
      locals: {},
    } as any;

    const response = await GET(event);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.path).toBe("/dashboard");

    prewarmSpy.mockRestore();
  });
});
