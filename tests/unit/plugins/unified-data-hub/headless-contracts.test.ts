/**
 * @file tests/unit/plugins/unified-data-hub/headless-contracts.test.ts
 * @description Headless API contract catalog tests (plugin architecture compliance).
 */

import { describe, expect, it } from "vitest";
import { unifiedDataHubHeadlessContracts } from "@plugins/unified-data-hub/headless-contracts";

describe("unified data hub headless contracts", () => {
  it("exports virtual slots and REST endpoint catalog", () => {
    expect(unifiedDataHubHeadlessContracts.pluginId).toBe("unified-data-hub");
    expect(unifiedDataHubHeadlessContracts.readOnly).toBe(false);
    expect(unifiedDataHubHeadlessContracts.endpoints.some((e) => e.method === "POST")).toBe(true);
    expect(unifiedDataHubHeadlessContracts.virtualSlots.length).toBeGreaterThan(0);
    expect(unifiedDataHubHeadlessContracts.endpoints.some((e) => e.path.includes("enrich"))).toBe(
      true,
    );
  });

  it("documents WebMCP and GraphQL parity", () => {
    expect(unifiedDataHubHeadlessContracts.webmcp.tools).toContain("enrich_virtual_collection");
    expect(unifiedDataHubHeadlessContracts.graphql.queries).toContain("virtualCollection");
    expect(unifiedDataHubHeadlessContracts.graphql.mutations).toContain("createVirtualEntry");
    expect(unifiedDataHubHeadlessContracts.adminApi.actions).toContain("getHeadlessContracts");
  });
});
