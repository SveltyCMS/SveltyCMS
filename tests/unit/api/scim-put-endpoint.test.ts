/**
 * @file tests/unit/api/scim-put-endpoint.test.ts
 * @description Endpoint-level SCIM PUT: the `active` value must reach the stored user.
 *
 * WHY: the utility mapping was fixed first, but the real PUT handler built its own update
 * object from `displayName`/`name.familyName` only and never read `body.active`, so an IdP
 * that provisions with PUT (rather than PATCH) still never deprovisioned anyone. These tests
 * drive `handleScimRoutes` with a real Request, assert what is persisted, and reject
 * non-boolean `active` values instead of coercing them.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const store = vi.hoisted(() => ({
  user: {
    _id: "u1",
    email: "user@example.com",
    username: "user",
    lastName: "Example",
    isActive: true,
    blocked: false,
    role: "user",
    tenantId: "tenant-1",
  } as Record<string, unknown>,
  updateUser: vi.fn(async (_id: string, updates: Record<string, unknown>) => {
    store.user = { ...store.user, ...updates };
    return { success: true, data: store.user };
  }),
  // auth-service.getUserById returns User | null (it unwraps the adapter result)
  getUserById: vi.fn(async () => store.user),
}));

vi.mock("@src/databases/db", () => ({
  auth: {
    updateUser: store.updateUser,
    getUserById: store.getUserById,
    createUser: vi.fn(),
    checkUser: vi.fn(),
  },
}));

vi.mock("@src/utils/scim-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@src/utils/scim-utils")>();
  return {
    ...actual,
    validateScimAuth: vi.fn(async () => ({ authenticated: true, tenantId: "tenant-1" })),
  };
});

import { handleScimRoutes } from "@src/routes/api/[...path]/handlers/scim";

function putEvent(body: unknown) {
  const url = "http://localhost/api/scim/v2/Users/u1";
  return {
    request: new Request(url, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    url: new URL(url),
    locals: {},
  } as never;
}

const call = (body: unknown) =>
  handleScimRoutes(putEvent(body), {} as never, "tenant-1" as never, ["scim", "v2", "Users", "u1"]);

describe("SCIM PUT applies active", () => {
  beforeEach(() => {
    store.user = { ...store.user, isActive: true, blocked: false };
    store.updateUser.mockClear();
  });

  it("persists active:false as isActive:false + blocked:true", async () => {
    const res = await call({ userName: "user@example.com", active: false });

    expect(res.status).toBe(200);
    expect(store.updateUser).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ isActive: false, blocked: true }),
      { tenantId: "tenant-1" },
    );
    // `blocked` is exactly the field handle-authentication.ts reads on session
    // revalidation, so a session for this user is rejected afterwards.
    expect(store.user.blocked).toBe(true);
    expect(await res.json()).toMatchObject({ active: false });
  });

  it("reactivates on active:true", async () => {
    store.user = { ...store.user, isActive: false, blocked: true };
    const res = await call({ userName: "user@example.com", active: true });

    expect(res.status).toBe(200);
    expect(store.updateUser).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ isActive: true, blocked: false }),
      { tenantId: "tenant-1" },
    );
    expect(store.user.blocked).toBe(false);
  });

  it("rejects a string active value instead of coercing it", async () => {
    const res = await call({ userName: "user@example.com", active: "false" });

    expect(res.status).toBe(400);
    expect(store.updateUser).not.toHaveBeenCalled();
    expect(store.user.blocked).toBe(false);
  });

  it("leaves the account untouched when active is omitted", async () => {
    store.user = { ...store.user, isActive: false, blocked: true };
    await call({ userName: "user@example.com" });

    const payload = store.updateUser.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("blocked");
    expect(store.user.blocked).toBe(true);
  });
});
