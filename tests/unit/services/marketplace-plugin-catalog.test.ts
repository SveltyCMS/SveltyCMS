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
});
