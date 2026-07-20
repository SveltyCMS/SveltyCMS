/**
 * @file tests/unit/services/marketplace-plugin-catalog.test.ts
 * @description Local plugin catalog includes Unified Data Hub marketplace stub.
 */

import { describe, expect, it } from "vitest";
import { marketplaceService } from "@src/services/core/marketplace-service";

describe("marketplace local plugin catalog", () => {
  it("lists Unified Data Hub when type=plugin", async () => {
    const result = await marketplaceService.list({ type: "plugin" });
    const hub = result.items.find((i) => i.id === "plugin-unified-data-hub");
    expect(hub).toBeDefined();
    expect(hub?.type).toBe("plugin");
    expect(hub?.installable).toBe(false);
    expect(hub?.homepageUrl).toContain("unified-data-hub");
  });

  it("returns all items when no type filter", async () => {
    const result = await marketplaceService.list({});
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.every((i: any) => i.id && i.name)).toBe(true);
  });

  it("supports pagination offset", async () => {
    const first = await marketplaceService.list({ type: "plugin", offset: 0, limit: 1 });
    expect(first.items.length).toBeLessThanOrEqual(1);
  });

  it("returns installable field as boolean for all items", async () => {
    const result = await marketplaceService.list({ type: "plugin" });
    for (const item of result.items) {
      expect(typeof item.installable).toBe("boolean");
    }
  });
});
