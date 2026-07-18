/**
 * @file tests/unit/utils/page-guards.test.ts
 * @description Fail-closed page guards used by every (app) +page.server load.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("@sveltejs/kit", async () => {
  const actual = await vi.importActual<typeof import("@sveltejs/kit")>("@sveltejs/kit");
  return {
    ...actual,
    redirect: (status: number, location: string) => {
      const err = new Error(`Redirect ${status} → ${location}`) as Error & {
        status: number;
        location: string;
      };
      err.status = status;
      err.location = location;
      throw err;
    },
    error: (status: number, message: string) => {
      const err = new Error(message) as Error & { status: number };
      err.status = status;
      throw err;
    },
  };
});

import {
  getAuthenticatedUser,
  hasPagePermission,
  requirePagePermission,
} from "@utils/page-guards.server";

describe("getAuthenticatedUser", () => {
  it("returns user when present", () => {
    const user = { _id: "u1", email: "a@b.c", role: "admin" } as any;
    expect(getAuthenticatedUser({ user } as any)).toBe(user);
  });

  it("redirects to /login when user missing", () => {
    try {
      getAuthenticatedUser({} as any);
      expect.unreachable("should redirect");
    } catch (err: any) {
      expect(err.status).toBe(302);
      expect(err.location).toBe("/login");
    }
  });

  it("preserves returnUrl on redirect", () => {
    try {
      getAuthenticatedUser({} as any, "/dashboard");
      expect.unreachable("should redirect");
    } catch (err: any) {
      expect(err.status).toBe(302);
      expect(err.location).toContain("/login?redirect=");
      expect(decodeURIComponent(err.location)).toContain("/dashboard");
    }
  });
});

describe("hasPagePermission / requirePagePermission", () => {
  const editorLocals = {
    user: { _id: "e1", email: "e@test.com", role: "editor" },
    isAdmin: false,
    roles: [{ _id: "editor", permissions: ["collection:read", "media:read"] }],
  } as any;

  it("admin fast-path grants any permission", () => {
    expect(hasPagePermission({ isAdmin: true, roles: [] } as any, "config:settings")).toBe(true);
  });

  it("matches role permissions", () => {
    expect(hasPagePermission(editorLocals, "collection:read")).toBe(true);
    expect(hasPagePermission(editorLocals, "config:settings")).toBe(false);
  });

  it("requirePagePermission throws 403 when denied", () => {
    try {
      requirePagePermission(editorLocals, "config:settings", "nope");
      expect.unreachable("should 403");
    } catch (err: any) {
      expect(err.status).toBe(403);
      expect(err.message).toMatch(/nope/i);
    }
  });

  it("requirePagePermission allows when role has permission", () => {
    expect(() => requirePagePermission(editorLocals, "media:read")).not.toThrow();
  });
});
