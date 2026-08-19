/**
 * @file tests/unit/plugins/plugin-route-registry.test.ts
 * @description Plugin `{ type: "route" }` table match — not a fifth extension type.
 */

import { describe, expect, it } from "vitest";
import { pluginRouteRegistry } from "../../../src/plugins/plugin-route-registry";

describe("pluginRouteRegistry", () => {
  it("matches method + path and records plugin id", async () => {
    pluginRouteRegistry.clear();
    pluginRouteRegistry.register("demo", {
      path: "/api/demo/ping",
      method: "GET",
      requiredCapabilities: "public",
      handler: async () => new Response("pong"),
    });
    const hit = pluginRouteRegistry.match("GET", "/api/demo/ping");
    expect(hit?.pluginId).toBe("demo");
    expect(hit?.requiredCapabilities).toBe("public");
    const body = await hit!.handler({} as never);
    expect(await body.text()).toBe("pong");
    expect(pluginRouteRegistry.match("POST", "/api/demo/ping")).toBeUndefined();
    pluginRouteRegistry.clear();
  });
});
