/**
 * @file tests/unit/routes/dashboard-page-server.test.ts
 * @description Unit tests for dashboard +page.server load permission gating
 * and widget discovery shape (widget list is install-specific; we only assert
 * structure and permission fail-closed).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@src/services/intelligence/behavioral-learner", () => ({
  getHotCollections: vi.fn().mockReturnValue([]),
}));

vi.mock("@utils/native-utils", () => ({
  generateUUID: vi.fn().mockReturnValue("uuid-test-1"),
}));

import { load } from "../../../src/routes/(app)/dashboard/+page.server";
import { dbAdapter } from "@src/databases/db";

function makeLocals(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      _id: { toString: () => "u1" },
      email: "admin@test.com",
      role: "admin",
    },
    isAdmin: true,
    roles: [
      {
        _id: "admin",
        name: "Administrator",
        permissions: ["dashboard:read"],
      },
    ],
    tenantId: "t1",
    ...overrides,
  };
}

describe("dashboard +page.server load", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns pageData.user and availableWidgets array for admin", async () => {
    const data: any = await load({ locals: makeLocals() } as any);
    expect(data.pageData.user.id).toBe("u1");
    expect(data.pageData.isAdmin).toBe(true);
    expect(Array.isArray(data.availableWidgets)).toBe(true);
    expect(Array.isArray(data.initialPreferences)).toBe(true);
    // Install-specific count — only assert each entry has required shape when present
    for (const w of data.availableWidgets) {
      expect(w).toHaveProperty("componentName");
      expect(w).toHaveProperty("name");
      expect(w).toHaveProperty("icon");
      expect(w).toHaveProperty("folder");
      expect(w).toHaveProperty("defaultSize");
    }
  });

  it("allows non-admin with dashboard:read permission", async () => {
    const data: any = await load({
      locals: makeLocals({
        isAdmin: false,
        // user.role must not be "admin" — load treats role===admin as isAdmin
        user: {
          _id: { toString: () => "u1" },
          email: "editor@test.com",
          role: "editor",
        },
        roles: [{ _id: "editor", permissions: ["dashboard:read", "collection:read"] }],
      }),
    } as any);
    expect(data.pageData.isAdmin).toBe(false);
    expect(data.pageData.user.id).toBe("u1");
  });

  it("throws 403 without dashboard permission", async () => {
    await expect(
      load({
        locals: makeLocals({
          isAdmin: false,
          user: {
            _id: { toString: () => "u2" },
            email: "viewer@test.com",
            role: "viewer",
          },
          roles: [{ _id: "viewer", permissions: ["collection:read"] }],
        }),
      } as any),
    ).rejects.toMatchObject({ status: 403 });
  });
});

type DashboardLoadEvent = Parameters<typeof load>[0];

interface DashboardPageData {
  pageData: {
    user: { id: string; email: string };
    isAdmin: boolean;
  };
  availableWidgets: unknown[];
  initialPreferences: unknown[] | null;
  hotCollections: unknown[];
}

function makeLoadEvent(userId: string, tenantId: string, email: string, role = "admin") {
  return {
    locals: makeLocals({
      user: { _id: { toString: () => userId }, email, role },
      isAdmin: true,
      tenantId,
    }),
  } as unknown as DashboardLoadEvent;
}

describe("dashboard +page.server load — concurrency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps user and tenant state per request under parallel loads", async () => {
    const [first, second] = (await Promise.all([
      load(makeLoadEvent("u1", "t1", "admin@test.com")),
      load(makeLoadEvent("u2", "t2", "editor@test.com", "editor")),
    ])) as unknown as [DashboardPageData, DashboardPageData];

    // Each load resolves its own locals — no module-level user/tenant bleed.
    expect(first.pageData.user.id).toBe("u1");
    expect(first.pageData.user.email).toBe("admin@test.com");
    expect(second.pageData.user.id).toBe("u2");
    expect(second.pageData.user.email).toBe("editor@test.com");
    expect(first.pageData.user.id).not.toBe(second.pageData.user.id);

    expect(Array.isArray(first.hotCollections)).toBe(true);
    expect(Array.isArray(second.hotCollections)).toBe(true);

    // The layout read is scoped per request, not shared across concurrent loads.
    const preferencesGet = vi.mocked(dbAdapter.system.preferences.get);
    expect(preferencesGet).toHaveBeenCalledWith("dashboard.layout.default", {
      scope: "user",
      userId: "u1",
      tenantId: "t1",
    });
    expect(preferencesGet).toHaveBeenCalledWith("dashboard.layout.default", {
      scope: "user",
      userId: "u2",
      tenantId: "t2",
    });
  });
});
