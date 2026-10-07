/**
 * @file tests/unit/multi-tenancy/create-user-session-scope.test.ts
 * @description Demo sign-up passes tenantId on the session. Auth must copy
 * that scope onto the options bag the namespace guard reads.
 *
 * Features:
 * - forwards session tenant into createUserAndSession options
 * - keeps a branded system scope unchanged
 * - still rejects a call that has no tenant scope
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DatabaseAdapter } from "@src/databases/db-interface";
import type { SessionStore } from "@src/databases/auth/types";
import type { DatabaseId, ISODateString } from "@src/content/types";

vi.mock("@src/databases/config-state", () => ({
  getPrivateEnv: () => (globalThis as { __privateEnv?: { MULTI_TENANT?: boolean } }).__privateEnv,
  setPrivateEnv: (env: { MULTI_TENANT?: boolean }) => {
    (globalThis as { __privateEnv?: { MULTI_TENANT?: boolean } }).__privateEnv = env;
  },
  loadPrivateConfig: () =>
    Promise.resolve((globalThis as { __privateEnv?: { MULTI_TENANT?: boolean } }).__privateEnv),
  clearPrivateConfigCache: () => {},
}));

vi.mock("@src/services/core/settings-service", () => ({
  getPrivateSettingSync: vi.fn(() => null),
  getPublicSettingSync: vi.fn(() => undefined),
  getPrivateSetting: vi.fn(async () => null),
  getPublicSetting: vi.fn(async () => null),
}));

vi.mock("@utils/security/crypto", () => ({
  hashPassword: vi.fn(async () => "$argon2id$test"),
  verifyPassword: vi.fn(async () => false),
  verifyDummyPassword: vi.fn(async () => false),
}));

const expires = "2030-01-01T00:00:00.000Z" as ISODateString;
const demoTenant = "tenant-demo" as DatabaseId;

describe("Auth.createUserAndSession tenant scope", () => {
  beforeEach(() => {
    (globalThis as { __privateEnv?: { MULTI_TENANT?: boolean } }).__privateEnv = {
      MULTI_TENANT: true,
    };
  });

  async function harness() {
    const { resetSafeQueryCache } = await import("@src/utils/security/safe-query");
    const { createTenantGuardedNamespace, resetGuardCache } =
      await import("@src/databases/crud-tenant-guard");
    const { Auth } = await import("@src/databases/auth");
    resetGuardCache();
    resetSafeQueryCache();

    const inner = {
      createUserAndSession: vi.fn().mockResolvedValue({
        success: true,
        data: { user: { _id: "user-1" }, session: { _id: "session-1" } },
      }),
    };
    const guarded = createTenantGuardedNamespace(inner, "reject", "auth");
    const auth = new Auth({ auth: guarded } as unknown as DatabaseAdapter, {} as SessionStore);
    return { auth, inner, guarded };
  }

  it("forwards the demo session tenant into the guarded options bag", async () => {
    const { auth, inner } = await harness();
    const result = await auth.createUserAndSession(
      {
        email: "demo@example.com",
        username: "demo",
        password: "Str0ng!Pass",
        role: "admin",
        tenantId: demoTenant,
      },
      { expires, tenantId: demoTenant },
    );

    expect(result.success).toBe(true);
    expect(inner.createUserAndSession).toHaveBeenCalledTimes(1);
    const options = inner.createUserAndSession.mock.calls[0]?.[2] as { tenantId?: string };
    expect(options.tenantId).toBe(demoTenant);
  });

  it("keeps a branded system scope and does not invent a tenant", async () => {
    const { withSystemScope } = await import("@src/databases/system-tenant-scope");
    const { auth, inner } = await harness();
    const scope = withSystemScope("bootstrap");
    const result = await auth.createUserAndSession(
      {
        email: "admin@example.com",
        username: "admin",
        password: "Str0ng!Pass",
        role: "admin",
      },
      { expires },
      scope,
    );

    expect(result.success).toBe(true);
    expect(inner.createUserAndSession.mock.calls[0]?.[2]).toBe(scope);
  });

  it("still rejects createUserAndSession when no tenant scope is present", async () => {
    const { auth, inner, guarded } = await harness();

    expect(() =>
      guarded.createUserAndSession(
        { email: "demo@example.com", password: "Str0ng!Pass" },
        { expires },
        {},
      ),
    ).toThrow(/Security Violation/);
    expect(inner.createUserAndSession).not.toHaveBeenCalled();

    await expect(
      auth.createUserAndSession(
        { email: "demo@example.com", username: "demo", password: "Str0ng!Pass", role: "user" },
        { expires },
      ),
    ).rejects.toThrow(/Security Violation/);
    expect(inner.createUserAndSession).not.toHaveBeenCalled();
  });
});
