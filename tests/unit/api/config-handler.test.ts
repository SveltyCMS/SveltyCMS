/**
 * @file tests/unit/api/config-handler.test.ts
 * @description Unit tests for handleConfigRoutes.
 */

import { describe, it, expect } from "vitest";
import { handleConfigRoutes } from "@src/routes/api/[...path]/handlers/config";

describe("handleConfigRoutes", () => {
  it("raises 501 for GET /api/config/history (unimplemented operation history)", async () => {
    const event = {
      request: new Request("http://localhost/api/config/history", { method: "GET" }),
    } as any;

    try {
      await handleConfigRoutes(event, {} as any, "tenant-1" as any, ["config", "history"]);
      expect.unreachable("Should have thrown 501");
    } catch (err: any) {
      expect(err.status).toBe(501);
      expect(err.message).toBe("Operation history is not yet persisted.");
      expect(err.code).toBe("NOT_IMPLEMENTED");
    }
  });

  it("raises 404 for unknown config actions", async () => {
    const event = {
      request: new Request("http://localhost/api/config/unknown", { method: "GET" }),
    } as any;

    try {
      await handleConfigRoutes(event, {} as any, "tenant-1" as any, ["config", "unknown"]);
      expect.unreachable("Should have thrown 404");
    } catch (err: any) {
      expect(err.status).toBe(404);
      expect(err.code).toBe("NOT_FOUND");
    }
  });
});
