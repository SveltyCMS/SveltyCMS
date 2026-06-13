/**
 * @file tests/unit/api/widget-security.test.ts
 * @description Unit tests for Widget API security, focusing on tenant isolation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";
import { createMockUser, createDbAdapterStub } from "../utils/mock-factories";

// Mock SvelteKit environment

// Mock all dependencies
vi.mock("@utils/api-handler", () => ({
  apiHandler: (fn: any) => fn,
}));

vi.mock("@src/databases/db", () => {
  const mockDb = createDbAdapterStub();
  return {
    dbAdapter: mockDb,
    getDb: vi.fn().mockReturnValue(mockDb),
    isDbConnected: vi.fn().mockReturnValue(true),
    dbInitPromise: Promise.resolve(),
    getDbInitPromise: vi.fn().mockResolvedValue(undefined),
    getAuth: vi.fn(),
  };
});

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

vi.mock("@src/services/core/settings-service", () => ({
  getPrivateSettingSync: vi.fn().mockReturnValue(false),
  getPublicSettingSync: vi.fn().mockReturnValue(true),
  getPrivateSetting: vi.fn().mockResolvedValue(false),
  getPublicSetting: vi.fn().mockResolvedValue(true),
  getAllSettings: vi.fn().mockResolvedValue({ public: {}, private: {} }),
  invalidateSettingsCache: vi.fn(),
  updateSettingsFromSnapshot: vi.fn().mockResolvedValue({ updated: 0 }),
}));

vi.mock("@utils/logger", () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    channel: vi.fn(() => mockLogger),
  };
  return { logger: mockLogger };
});

// Import dispatcher
import { GET as dispatcherGET, POST as dispatcherPOST } from "@src/routes/api/[...path]/+server";

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
        headers: {
          get: vi.fn().mockImplementation((name) => eventOverrides.headers?.[name]),
        },
      },
      locals: {
        __testBypass: true,
        dbAdapter: mockDbAdapter,
        user: createMockUser({
          _id: "u1",
          email: "admin@test.com",
          role: "admin",
          isAdmin: true,
        }),
        roles: [
          {
            _id: "admin",
            name: "Administrator",
            isAdmin: true,
            permissions: [],
          },
        ],
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

    if (method === "GET") return dispatcherGET(event);
    if (method === "POST") return dispatcherPOST(event);
    return dispatcherGET(event);
  };

  describe("List Widgets (GET /api/widgets/list)", () => {
    it("should fetch widgets for the current tenant", async () => {
      mockDbAdapter.system.widgets.getActiveWidgets.mockResolvedValue({
        success: true,
        data: ["test-widget"],
      });

      const response = await callDispatcher("widgets/list", "GET", {
        locals: { tenantId: "tenant-1", __testBypass: true },
      });
      const data = await response!.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.tenantId).toBe("tenant-1");
    });
  });

  describe("Activate Widget (POST /api/widgets/activate/[id])", () => {
    it("should activate widget in current tenant context", async () => {
      mockDbAdapter.system.widgets.findAll.mockResolvedValue({
        success: true,
        data: [{ _id: "test-widget-id", name: "test-widget" }],
      });
      mockDbAdapter.system.widgets.activate.mockResolvedValue({
        success: true,
      });

      const response = await callDispatcher("widgets/activate/test-widget", "POST", {
        locals: { tenantId: "tenant-1", __testBypass: true },
      });
      const data = await response!.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockDbAdapter.system.widgets.activate).toHaveBeenCalledWith("test-widget");
    });
  });

  describe("Deactivate Widget (POST /api/widgets/deactivate/[id])", () => {
    it("should deactivate widget in current tenant context", async () => {
      mockDbAdapter.system.widgets.findAll.mockResolvedValue({
        success: true,
        data: [{ _id: "test-widget-id", name: "test-widget" }],
      });
      mockDbAdapter.system.widgets.deactivate.mockResolvedValue({
        success: true,
      });

      const response = await callDispatcher("widgets/deactivate/test-widget", "POST", {
        locals: { tenantId: "tenant-1", __testBypass: true },
      });
      const data = await response!.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockDbAdapter.system.widgets.deactivate).toHaveBeenCalledWith("test-widget");
    });
  });
});
