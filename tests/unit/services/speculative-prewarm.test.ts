/**
 * @file tests/unit/services/speculative-prewarm.test.ts
 * @description Unit tests for AI-driven speculative pre-warming in RouteResourceStateMachine.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { routeResourceStateMachine } from "@src/services/core/route-resource-state-machine";

vi.mock("@src/services/intelligence/behavioral-learner", () => ({
  predictNextPathAdaptive: vi.fn((_tenantId: string, currentPath: string) => {
    if (currentPath === "/collections/articles") {
      return "/collections/articles/new";
    }
    if (currentPath === "/dashboard") {
      return "/mediagallery";
    }
    return null;
  }),
  getHotEntries: vi.fn(() => []),
}));

describe("RouteResourceStateMachine - AI Speculative Pre-Warming", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("speculatively prewarms predicted target route when transition exists", async () => {
    const prewarmSpy = vi
      .spyOn(routeResourceStateMachine, "prewarmRouteResources")
      .mockResolvedValue(undefined);

    const predicted = await routeResourceStateMachine.speculativePrewarm(
      "/collections/articles",
      "global",
      "http://localhost:5173",
    );

    expect(predicted).toBe("/collections/articles/new");
    expect(prewarmSpy).toHaveBeenCalledWith(
      "/collections/articles/new",
      "http://localhost:5173",
      "global",
      undefined,
    );
  });

  it("returns null and does not trigger prewarm when no prediction exists", async () => {
    const prewarmSpy = vi
      .spyOn(routeResourceStateMachine, "prewarmRouteResources")
      .mockResolvedValue(undefined);

    const predicted = await routeResourceStateMachine.speculativePrewarm(
      "/unknown-route",
      "global",
      "http://localhost:5173",
    );

    expect(predicted).toBeNull();
    expect(prewarmSpy).not.toHaveBeenCalled();
  });

  it("safely ignores missing origin during prediction resolution", async () => {
    const prewarmSpy = vi
      .spyOn(routeResourceStateMachine, "prewarmRouteResources")
      .mockResolvedValue(undefined);

    const predicted = await routeResourceStateMachine.speculativePrewarm("/dashboard", "global");

    expect(predicted).toBe("/mediagallery");
    expect(prewarmSpy).not.toHaveBeenCalled();
  });
});
