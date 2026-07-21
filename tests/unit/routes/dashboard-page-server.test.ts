/**
 * @file tests/unit/routes/dashboard-page-server.test.ts
 * @description Unit tests for dashboard +page.server load permission gating
 * and widget discovery shape (widget list is install-specific; we only assert
 * structure and permission fail-closed).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@utils/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  },
}));

vi.mock("@utils/page-guards.server", () => ({
  getAuthenticatedUser: vi.fn((locals: any) => {
    if (!locals?.user) {
      const err = new Error("redirect") as Error & { status: number };
      err.status = 302;
      throw err;
    }
    return locals.user;
  }),
}));

vi.mock("@src/services/intelligence/behavioral-learner", () => ({
  getHotCollections: vi.fn().mockReturnValue([]),
}));

vi.mock("@utils/native-utils", () => ({
  generateUUID: vi.fn().mockReturnValue("uuid-test-1"),
}));

import { load } from "../../../src/routes/(app)/dashboard/+page.server";

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
    // Install-specific count — only assert each entry has required shape when present
    for (const w of data.availableWidgets) {
      expect(w).toHaveProperty("componentName");
      expect(w).toHaveProperty("name");
      expect(w).toHaveProperty("icon");
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
