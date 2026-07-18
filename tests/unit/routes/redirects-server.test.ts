/**
 * @file tests/unit/routes/redirects-server.test.ts
 * @description Unit tests for redirect save/delete server helpers (admin + validation).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@utils/page-guards.server", () => ({
  getAuthenticatedUser: vi.fn((locals: any) => {
    if (!locals?.user) throw Object.assign(new Error("auth"), { status: 302 });
    return locals.user;
  }),
}));

const createMock = vi.fn().mockResolvedValue({ success: true });
const updateMock = vi.fn().mockResolvedValue({ success: true });
const deleteMock = vi.fn().mockResolvedValue({ success: true });

vi.mock("@src/databases/db", () => ({
  dbAdapter: {},
}));

vi.mock("@src/services/sdk", () => ({
  LocalCMS: class {
    collections = {
      create: createMock,
      update: updateMock,
      delete: deleteMock,
    };
  },
}));

vi.mock("@src/hooks/handle-redirects", () => ({
  invalidateRedirectCache: vi.fn(),
}));

import {
  saveRedirect,
  deleteRedirect,
} from "../../../src/routes/(app)/config/redirects/redirects.server";
import { invalidateRedirectCache } from "@src/hooks/handle-redirects";

const adminLocals = {
  user: { _id: "u1", role: "admin" },
  isAdmin: true,
  tenantId: "tenant-a",
} as any;

describe("saveRedirect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-admin", async () => {
    await expect(
      saveRedirect({ user: { _id: "u2" }, isAdmin: false, tenantId: "t" } as any, {
        from: "/a",
        to: "/b",
        type: 301,
        active: true,
        isRegex: false,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("rejects invalid paths with 400", async () => {
    await expect(
      saveRedirect(adminLocals, {
        from: "",
        to: "bad",
        type: 301,
        active: true,
        isRegex: false,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("creates redirect and invalidates cache", async () => {
    const result = await saveRedirect(adminLocals, {
      from: "old-path",
      to: "/new-path",
      type: 302,
      active: true,
      isRegex: false,
    });
    expect(result.success).toBe(true);
    expect(createMock).toHaveBeenCalledWith(
      "redirects",
      expect.objectContaining({
        from: "/old-path",
        to: "/new-path",
        type: 302,
        tenantId: "tenant-a",
      }),
    );
    expect(invalidateRedirectCache).toHaveBeenCalledWith("tenant-a");
  });

  it("updates when id present", async () => {
    await saveRedirect(adminLocals, {
      id: "rid-1",
      from: "/x",
      to: "/y",
      type: 301,
      active: false,
      isRegex: false,
    });
    expect(updateMock).toHaveBeenCalledWith(
      "redirects",
      "rid-1",
      expect.objectContaining({ from: "/x", to: "/y", active: false }),
    );
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("deleteRedirect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-admin", async () => {
    await expect(
      deleteRedirect({ user: { _id: "u2" }, isAdmin: false } as any, "rid"),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("deletes and invalidates cache", async () => {
    const result = await deleteRedirect(adminLocals, "rid-9");
    expect(result.success).toBe(true);
    expect(deleteMock).toHaveBeenCalledWith("redirects", "rid-9");
    expect(invalidateRedirectCache).toHaveBeenCalledWith("tenant-a");
  });
});
