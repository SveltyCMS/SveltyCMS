/**
 * @file tests/unit/api/openapi.test.ts
 * @description Unit tests for the OpenAPI 3.1.0 specification endpoint.
 */

import { describe, it, expect, vi } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";

// Mock dependencies
vi.mock("@src/databases/db", () => ({
  dbAdapter: {
    getVersion: vi.fn().mockResolvedValue({ success: true, data: "1.0.0" }),
  },
  getDb: vi.fn().mockReturnValue({
    getVersion: vi.fn().mockResolvedValue({ success: true, data: "1.0.0" }),
  }),
  getDbInitPromise: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@src/content", () => ({
  contentSystem: {
    getCollections: vi.fn().mockResolvedValue([
      {
        name: "Posts",
        fields: [
          { db_fieldName: "title", label: "Title", widget: { Name: "Input" }, translated: true },
          { db_fieldName: "views", label: "Views", widget: { Name: "Number" }, translated: false },
        ],
      },
    ]),
  },
}));

vi.mock("@src/services/settings-service", () => ({
  getPrivateSettingSync: vi.fn().mockReturnValue(false),
  getPublicSettingSync: vi.fn().mockReturnValue(true),
}));

vi.mock("@utils/api-handler", () => ({
  apiHandler: (fn: any) => fn,
}));

// Import raw dispatcher handler
import { GET as dispatcherGET } from "@src/routes/api/[...path]/+server";

describe("OpenAPI Specification API", () => {
  const createMockEvent = (path: string) => {
    return {
      url: new URL(`http://localhost/api/${path}`),
      params: { path },
      request: {
        method: "GET",
        headers: new Map(),
      },
      locals: {
        user: { _id: "u1", role: "admin", isAdmin: true },
        tenantId: "t1",
        roles: [{ _id: "admin", isAdmin: true }],
      },
      cookies: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
    } as unknown as RequestEvent;
  };

  it("should return a valid OpenAPI 3.1.0 JSON", async () => {
    const event = createMockEvent("openapi.json");
    const response = await dispatcherGET(event);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.openapi).toBe("3.1.0");
    expect(data.info.title).toContain("SveltyCMS");
    expect(data.paths).toBeDefined();

    // Check for dynamic collection paths
    expect(data.paths["/collections/Posts"]).toBeDefined();
    expect(data.paths["/collections/Posts"].get).toBeDefined();
    expect(data.paths["/collections/Posts"].get.operationId).toBe("collections.Posts.list");
    expect(data.paths["/collections/Posts"].post).toBeDefined();

    // Check for components
    expect(data.components.schemas.Collection_Posts).toBeDefined();
    const postSchema = data.components.schemas.Collection_Posts;
    expect(postSchema.properties.title.type).toBe("object"); // Multilingual
    expect(postSchema.properties.title.example).toBeDefined();
    expect(postSchema.properties.views.type).toBe("number"); // Scalar
    expect(postSchema.properties.views.example).toBe(42);
  });

  it("should include system paths with operation IDs", async () => {
    const event = createMockEvent("openapi.json");
    const response = await dispatcherGET(event);
    const data = await response.json();

    expect(data.paths["/system/health"]).toBeDefined();
    expect(data.paths["/system/health"].get.operationId).toBe("system.health");
    expect(data.paths["/auth/login"]).toBeDefined();
    expect(data.paths["/auth/login"].post.operationId).toBe("auth.login");
    expect(data.paths["/media/upload"]).toBeDefined();
  });
});
