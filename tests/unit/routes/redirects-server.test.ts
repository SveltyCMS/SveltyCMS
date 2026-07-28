/**
 * @file tests/unit/routes/redirects-server.test.ts
 * @description Unit tests for redirect save/delete server helpers (admin + validation).
 *
 * Primary storage is redirectsMV via dbAdapter.crud; content collection is a best-effort mirror.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@utils/page-guards.server", () => ({
  getAuthenticatedUser: vi.fn((locals: any) => {
    if (!locals?.user) throw Object.assign(new Error("auth"), { status: 302 });
    return locals.user;
  }),
}));

const insertMock = vi.fn().mockResolvedValue({ success: true, data: { _id: "new-id" } });
const updateMock = vi.fn().mockResolvedValue({ success: true });
const deleteMock = vi.fn().mockResolvedValue({ success: true });
const findManyMock = vi.fn().mockResolvedValue({ success: true, data: [] });

const collectionCreate = vi.fn().mockResolvedValue({ success: true });
const collectionUpdate = vi.fn().mockResolvedValue({ success: true });
const collectionDelete = vi.fn().mockResolvedValue({ success: true });

vi.mock("@src/databases/db", () => ({
  dbAdapter: {
    crud: {
      insert: (...args: unknown[]) => insertMock(...args),
      update: (...args: unknown[]) => updateMock(...args),
      delete: (...args: unknown[]) => deleteMock(...args),
      findMany: (...args: unknown[]) => findManyMock(...args),
    },
  },
}));

vi.mock("@src/services/sdk", () => ({
  LocalCMS: class {
    collections = {
      create: collectionCreate,
      update: collectionUpdate,
      delete: collectionDelete,
      find: vi.fn().mockResolvedValue({ success: true, data: [] }),
    };
  },
}));

vi.mock("@src/hooks/handle-redirects", () => ({
  invalidateRedirectCache: vi.fn(),
}));

import {
  saveRedirect,
  deleteRedirect,
  listRedirects,
  normalizeRedirectRow,
} from "../../../src/routes/(app)/config/redirects/redirects.server";
import { invalidateRedirectCache } from "@src/hooks/handle-redirects";

const adminLocals = {
  user: { _id: "u1", role: "admin" },
  isAdmin: true,
  tenantId: "tenant-a",
} as any;

describe("normalizeRedirectRow", () => {
  it("maps source/target and parses string data JSON", () => {
    expect(
      normalizeRedirectRow({
        _id: "1",
        source: "/a",
        target: "/b",
        type: 301,
        active: 1,
      }),
    ).toMatchObject({ from: "/a", to: "/b", type: 301 });

    expect(
      normalizeRedirectRow({
        _id: "2",
        data: JSON.stringify({ from: "/x", to: "/y", type: 302 }),
      }),
    ).toMatchObject({ from: "/x", to: "/y", type: 302 });
  });
});

describe("saveRedirect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertMock.mockResolvedValue({ success: true, data: { _id: "new-id" } });
    updateMock.mockResolvedValue({ success: true });
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

  it("creates redirect in redirectsMV and invalidates cache", async () => {
    const result = await saveRedirect(adminLocals, {
      from: "old-path",
      to: "/new-path",
      type: 302,
      active: true,
      isRegex: false,
    });
    expect(result.success).toBe(true);
    expect(insertMock).toHaveBeenCalledWith(
      "redirectsMV",
      expect.objectContaining({
        source: "/old-path",
        target: "/new-path",
        type: 302,
        tenantId: "tenant-a",
      }),
      expect.anything(),
    );
    expect(invalidateRedirectCache).toHaveBeenCalledWith("tenant-a");
  });

  it("updates redirectsMV when id present", async () => {
    await saveRedirect(adminLocals, {
      id: "rid-1",
      from: "/x",
      to: "/y",
      type: 301,
      active: false,
      isRegex: false,
    });
    expect(updateMock).toHaveBeenCalledWith(
      "redirectsMV",
      "rid-1",
      expect.objectContaining({
        source: "/x",
        target: "/y",
        active: false,
      }),
      expect.anything(),
    );
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

  it("deletes from redirectsMV and invalidates cache", async () => {
    const result = await deleteRedirect(adminLocals, "rid-9");
    expect(result.success).toBe(true);
    expect(deleteMock).toHaveBeenCalledWith("redirectsMV", "rid-9", expect.anything());
    expect(invalidateRedirectCache).toHaveBeenCalledWith("tenant-a");
  });
});

describe("listRedirects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps MV rows to from/to", async () => {
    findManyMock.mockResolvedValueOnce({
      success: true,
      data: [
        {
          _id: "r1",
          source: "/old",
          target: "/new",
          type: 301,
          active: 1,
          isRegex: 0,
        },
      ],
    });
    const rows = await listRedirects(adminLocals);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ from: "/old", to: "/new", _id: "r1" });
  });
});
