/**
 * @file tests/unit/api/widget-security.test.ts
 * @description Unit tests for Widget API security, focusing on tenant isolation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";

// Mock SvelteKit environment

// Mock all dependencies

// Mock all dependencies
vi.mock("@utils/api-handler", () => ({
  apiHandler: (fn: any) => fn,
}));

vi.mock("@src/databases/db", () => ({
  auth: {},
  dbAdapter: {
    system: {
      widgets: {
        getActiveWidgets: vi.fn(),
        activate: vi.fn(),
        deactivate: vi.fn(),
      },
    },
  },
  dbInitPromise: Promise.resolve(),
  getDbInitPromise: vi.fn().mockResolvedValue(undefined),
  getAuth: vi.fn(),
}));

vi.mock("@src/stores/widget-store.svelte.ts", () => ({
  widgets: {
    initialize: vi.fn(() => Promise.resolve(true)),
    widgetFunctions: {
      "test-widget": { Name: "Test Widget", Icon: "icon", Description: "Desc" },
    },
    coreWidgets: ["test-widget"],
  },
  getWidgetDependencies: vi.fn(() => []),
}));

vi.mock("@src/services/settings-service", () => ({
  getPrivateSettingSync: vi.fn().mockReturnValue(false),
  getPublicSettingSync: vi.fn().mockReturnValue(true),
}));

vi.mock("@utils/logger.server", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import dispatcher
import { _handler as dispatcher } from "@src/routes/api/[...path]/+server";

describe("Widget API Security - Tenant Isolation", () => {
  let mockDbAdapter: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const dbModule = await import("@src/databases/db");
    mockDbAdapter = dbModule.dbAdapter;
  });

  const callDispatcher = (path: string, method: string, eventOverrides: any = {}) => {
    const { locals, ...overrides } = eventOverrides;
    const event = {
      params: { path },
      url: new URL(`http://localhost/api/${path}`),
      request: {
        method,
        json: vi.fn().mockResolvedValue(eventOverrides.body || {}),
        headers: { get: vi.fn().mockImplementation((name) => eventOverrides.headers?.[name]) },
      },
      locals: {
        dbAdapter: mockDbAdapter,
        user: { _id: "u1", email: "admin@test.com", role: "admin-role" },
        roles: [{ _id: "admin-role", name: "Administrator", isAdmin: true, permissions: [] }],
        ...locals,
      },
      cookies: {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
      },
      fetch: vi.fn(),
      ...overrides,
    } as unknown as RequestEvent;

    return dispatcher(event);
  };

  describe("List Widgets (GET /api/widgets/list)", () => {
    it("should fetch widgets for the current tenant", async () => {
      mockDbAdapter.system.widgets.getActiveWidgets.mockResolvedValue({
        success: true,
        data: ["test-widget"],
      });

      const response = await callDispatcher("widgets/list", "GET", {
        locals: { tenantId: "tenant-1" },
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.tenantId).toBe("tenant-1");
    });
  });

  describe("Activate Widget (POST /api/widgets/activate/[id])", () => {
    it("should activate widget in current tenant context", async () => {
      mockDbAdapter.system.widgets.activate.mockResolvedValue({
        success: true,
      });

      const response = await callDispatcher("widgets/activate/test-widget", "POST", {
        locals: { tenantId: "tenant-1" },
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockDbAdapter.system.widgets.activate).toHaveBeenCalledWith("test-widget");
    });
  });

  describe("Deactivate Widget (POST /api/widgets/deactivate/[id])", () => {
    it("should deactivate widget in current tenant context", async () => {
      mockDbAdapter.system.widgets.deactivate.mockResolvedValue({
        success: true,
      });

      const response = await callDispatcher("widgets/deactivate/test-widget", "POST", {
        locals: { tenantId: "tenant-1" },
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockDbAdapter.system.widgets.deactivate).toHaveBeenCalledWith("test-widget");
    });
  });
});
