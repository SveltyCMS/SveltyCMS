/**
 * @file tests/unit/routes/system-handler.test.ts
 * @description Unit tests for handleSystemRoutes covering health and version endpoints.
 */

import { describe, it, expect, vi } from "vitest";
import { handleSystemRoutes } from "@src/routes/api/[...path]/handlers/system";
import type { DatabaseId } from "@src/content/types";

describe("handleSystemRoutes - System Endpoints", () => {
  it("routes GET /api/system/health to health handler", async () => {
    const mockCms = {
      db: {
        isConnected: vi.fn().mockResolvedValue(true),
      },
    } as any;

    const mockUrl = new URL("http://localhost:5173/api/system/health");
    const event = {
      url: mockUrl,
      request: new Request(mockUrl),
      locals: {},
    } as any;

    const response = await handleSystemRoutes(event, mockCms, "global" as DatabaseId, [
      "system",
      "health",
    ]);
    expect(response).toBeDefined();
    expect(response?.status).toBe(200);

    const body = await response?.json();
    expect(body.success).toBe(true);
    expect(body.data.database).toBe("connected");
  });

  it("routes GET /api/system?action=health to health handler", async () => {
    const mockCms = {
      db: {
        isConnected: vi.fn().mockResolvedValue(true),
      },
    } as any;

    const mockUrl = new URL("http://localhost:5173/api/system?action=health");
    const event = {
      url: mockUrl,
      request: new Request(mockUrl),
      locals: {},
    } as any;

    const response = await handleSystemRoutes(event, mockCms, "global" as DatabaseId, ["system"]);
    expect(response).toBeDefined();
    expect(response?.status).toBe(200);

    const body = await response?.json();
    expect(body.success).toBe(true);
    expect(body.data.database).toBe("connected");
  });

  it("routes GET /api/system/version to version handler", async () => {
    const mockCms = {} as any;

    const mockUrl = new URL("http://localhost:5173/api/system/version");
    const event = {
      url: mockUrl,
      request: new Request(mockUrl),
      locals: {},
    } as any;

    const response = await handleSystemRoutes(event, mockCms, "global" as DatabaseId, [
      "system",
      "version",
    ]);
    expect(response).toBeDefined();
    expect(response?.status).toBe(200);

    const body = await response?.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("currentVersion");
  });
});
