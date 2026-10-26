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

    expect(prewarmSpy).toHaveBeenCalledWith("/dashboard", "http://localhost:5173", "global", null);

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

type PrewarmEvent = Parameters<typeof GET>[0];

function makeEvent(targetPath: string): PrewarmEvent {
  const url = new URL(
    `http://localhost:5173/api/system/prewarm-route?path=${encodeURIComponent(targetPath)}`,
  );
  return { url, request: new Request(url), locals: {} } as unknown as PrewarmEvent;
}

describe("GET /api/system/prewarm-route — failure path", () => {
  it("degrades gracefully when route pre-warming rejects", async () => {
    const prewarmSpy = vi
      .spyOn(routeResourceStateMachine, "prewarmRouteResources")
      .mockRejectedValue(new Error("prewarm boom"));
    const speculativeSpy = vi
      .spyOn(routeResourceStateMachine, "speculativePrewarm")
      .mockResolvedValue(null);

    const response = await GET(makeEvent("/config/collectionbuilder"));

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      success: boolean;
      path: string;
      error?: unknown;
    };
    // The endpoint is best-effort: a rejected pre-warm must not fail the request,
    // and speculative work still runs so hot entries stay warm.
    expect(body.success).toBe(true);
    expect(body.path).toBe("/config/collectionbuilder");
    expect(body.error).toBeUndefined();
    expect(prewarmSpy).toHaveBeenCalledWith(
      "/config/collectionbuilder",
      "http://localhost:5173",
      "global",
      null,
    );
    expect(speculativeSpy).toHaveBeenCalledTimes(1);

    prewarmSpy.mockRestore();
    speculativeSpy.mockRestore();
  });
});

describe("GET /api/system/prewarm-route — concurrency", () => {
  it("echoes each path and single-flights pre-warming per parallel request", async () => {
    const prewarmSpy = vi
      .spyOn(routeResourceStateMachine, "prewarmRouteResources")
      .mockResolvedValue(undefined);

    const [first, second] = await Promise.all([
      GET(makeEvent("/dashboard")),
      GET(makeEvent("/config/collectionbuilder")),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const [firstBody, secondBody] = (await Promise.all([first.json(), second.json()])) as [
      { path: string },
      { path: string },
    ];

    // Single-flight must not cross the results: each response echoes its own path.
    expect(firstBody.path).toBe("/dashboard");
    expect(secondBody.path).toBe("/config/collectionbuilder");
    expect(prewarmSpy).toHaveBeenCalledTimes(2);
    expect(prewarmSpy).toHaveBeenCalledWith("/dashboard", "http://localhost:5173", "global", null);
    expect(prewarmSpy).toHaveBeenCalledWith(
      "/config/collectionbuilder",
      "http://localhost:5173",
      "global",
      null,
    );

    prewarmSpy.mockRestore();
  });
});
