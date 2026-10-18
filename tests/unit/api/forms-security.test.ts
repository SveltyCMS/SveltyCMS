/**
 * @file tests/unit/api/forms-security.test.ts
 * @description Security regressions for the public forms endpoint and the CRUD
 * tenant guard's body-supplied tenantId handling.
 *
 * Covers:
 * - fail-closed collection resolution (`formEnabled` opt-in, generic 404)
 * - key allowlisting + server-forced `status: "pending"`
 * - `collections:read` enforcement on GET
 * - cross-tenant body `tenantId` rejection under MULTI_TENANT
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";
import type { ICrudAdapter } from "@src/databases/db-interface";
import { AppError } from "@utils/error-handling";
import { handleFormsRoutes } from "@src/routes/api/[...path]/handlers/forms";
import {
  createTenantGuardedCrud,
  enforceDataTenantIdSync,
  resetGuardCache,
} from "@src/databases/crud-tenant-guard";
import { resetSafeQueryCache } from "@src/utils/security/safe-query";
import { RateLimiter } from "@src/hooks/handle-rate-limit";

vi.mock("@src/databases/config-state", () => ({
  getPrivateEnv: () => (globalThis as { __privateEnv?: unknown }).__privateEnv,
  setPrivateEnv: (env: unknown) => {
    (globalThis as { __privateEnv?: unknown }).__privateEnv = env;
  },
  loadPrivateConfig: () => Promise.resolve((globalThis as { __privateEnv?: unknown }).__privateEnv),
  clearPrivateConfigCache: () => {},
}));

const TEST_TENANT = "tenant-a" as DatabaseId;

const FORM_SCHEMA = {
  _id: "contact",
  name: "contact",
  formEnabled: true,
  fields: [
    { db_fieldName: "name", name: "name", type: "string", required: true },
    { db_fieldName: "email", name: "email", type: "string", required: true },
    { db_fieldName: "message", name: "message", type: "string" },
    { db_fieldName: "age", name: "age", type: "number" },
  ],
};

function createEvent(method: string, body?: unknown): RequestEvent {
  return {
    request: {
      method,
      headers: new Headers({ "content-type": "application/json", "user-agent": "vitest" }),
      json: async () => body ?? {},
      formData: async () => new FormData(),
    },
    url: new URL("http://localhost:5173/api/forms/contact"),
    locals: {},
    getClientAddress: () => "192.168.1.50",
  } as unknown as RequestEvent;
}

function createMockCms(schema: unknown = FORM_SCHEMA) {
  return {
    collections: {
      getSchema: vi.fn().mockResolvedValue(schema),
      find: vi.fn().mockResolvedValue({ success: true, data: [] }),
      create: vi.fn().mockResolvedValue({ success: true, data: { _id: "sub_1" } }),
    },
  } as unknown as LocalCMS & {
    collections: {
      getSchema: ReturnType<typeof vi.fn>;
      find: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
  };
}

describe("POST /api/forms/:collection", () => {
  beforeEach(() => {
    (globalThis as { __privateEnv?: unknown }).__privateEnv = { MULTI_TENANT: false };
    resetGuardCache();
    resetSafeQueryCache();
  });

  it("rejects a collection that has not opted in with formEnabled", async () => {
    const cms = createMockCms({ ...FORM_SCHEMA, formEnabled: false });
    const event = createEvent("POST", { name: "Jane", email: "jane@example.com" });

    await expect(
      handleFormsRoutes(event, cms, TEST_TENANT, ["forms", "contact"]),
    ).rejects.toMatchObject({ status: 404 });
    expect(cms.collections.create).not.toHaveBeenCalled();
  });

  it("rejects system tables and unknown collections with the same 404", async () => {
    const cms = createMockCms();
    cms.collections.getSchema.mockRejectedValue(
      new AppError("Collection not found", 404, "COLLECTION_NOT_FOUND"),
    );
    const event = createEvent("POST", {
      email: "attacker@example.com",
      password: "pwn",
      role: "admin",
      isAdmin: true,
    });

    await expect(
      handleFormsRoutes(event, cms, TEST_TENANT, ["forms", "auth_users"]),
    ).rejects.toMatchObject({ status: 404 });
    expect(cms.collections.create).not.toHaveBeenCalled();
  });

  it("accepts declared fields only and forces a pending status", async () => {
    const cms = createMockCms();
    const event = createEvent("POST", {
      name: "Jane Doe",
      email: "jane@example.com",
      message: "Hello",
      age: "42",
      // Privileged / managed keys must never reach persistence.
      _id: "injected-id",
      tenantId: "tenant-b",
      role: "admin",
      isAdmin: true,
      permissions: ["*"],
      status: "published",
      blocked: false,
      password: "plaintext",
      passwordHash: "hash",
      emailVerified: true,
      isRegistered: true,
      mfaRequired: false,
      createdAt: "2000-01-01T00:00:00.000Z",
      updatedAt: "2000-01-01T00:00:00.000Z",
      isDeleted: false,
      _formInjected: "x",
      undeclaredColumn: "drop me",
    });

    const res = await handleFormsRoutes(event, cms, TEST_TENANT, ["forms", "contact"]);
    expect(res.status).toBe(201);

    expect(cms.collections.create).toHaveBeenCalledTimes(1);
    const [collection, payload, options] = cms.collections.create.mock.calls[0];
    expect(collection).toBe("contact");
    expect(options).toEqual({ tenantId: TEST_TENANT, system: true });

    expect(payload.status).toBe("draft");
    expect(payload._formStatus).toBe("pending");
    expect(payload.name).toBe("Jane Doe");
    expect(payload.email).toBe("jane@example.com");
    expect(payload.age).toBe(42);
    expect(payload._formSubmittedAt).toBeDefined();

    for (const key of [
      "_id",
      "tenantId",
      "role",
      "isAdmin",
      "permissions",
      "blocked",
      "password",
      "passwordHash",
      "emailVerified",
      "isRegistered",
      "mfaRequired",
      "createdAt",
      "updatedAt",
      "isDeleted",
      "_formInjected",
      "undeclaredColumn",
    ]) {
      expect(payload).not.toHaveProperty(key);
    }
  });

  it("rejects a submission missing a required field", async () => {
    const cms = createMockCms();
    const event = createEvent("POST", { name: "Jane Doe" });

    await expect(
      handleFormsRoutes(event, cms, TEST_TENANT, ["forms", "contact"]),
    ).rejects.toMatchObject({ status: 400 });
    expect(cms.collections.create).not.toHaveBeenCalled();
  });

  it("rejects when rate limit is exceeded in production mode", async () => {
    const originalTestMode = process.env.TEST_MODE;
    const isLimitedSpy = vi.spyOn(RateLimiter.prototype, "isLimited").mockResolvedValueOnce(true);

    try {
      delete process.env.TEST_MODE;
      const cms = createMockCms();
      const event = createEvent("POST", { name: "Jane", email: "jane@example.com" });

      await expect(
        handleFormsRoutes(event, cms, TEST_TENANT, ["forms", "contact"]),
      ).rejects.toMatchObject({ status: 429 });
    } finally {
      process.env.TEST_MODE = originalTestMode;
      isLimitedSpy.mockRestore();
    }
  });
});

describe("GET /api/forms/:collection", () => {
  beforeEach(() => {
    (globalThis as { __privateEnv?: unknown }).__privateEnv = { MULTI_TENANT: false };
    resetGuardCache();
    resetSafeQueryCache();
  });

  it("rejects an authenticated user without collections:read", async () => {
    const cms = createMockCms();
    const event = createEvent("GET");
    event.locals.user = {
      _id: "user-no-perm",
      email: "user@example.com",
      role: "editor",
      permissions: [],
    } as unknown as typeof event.locals.user;
    event.locals.roles = [];
    event.locals.isAdmin = false;

    await expect(
      handleFormsRoutes(event, cms, TEST_TENANT, ["forms", "contact"]),
    ).rejects.toMatchObject({ status: 403 });
    expect(cms.collections.find).not.toHaveBeenCalled();
  });

  it("allows a user holding collections:read", async () => {
    const cms = createMockCms();
    const event = createEvent("GET");
    event.locals.user = {
      _id: "user-reader",
      email: "reader@example.com",
      role: "editor",
      permissions: ["collections:read"],
    } as unknown as typeof event.locals.user;
    event.locals.roles = [];
    event.locals.isAdmin = false;

    const res = await handleFormsRoutes(event, cms, TEST_TENANT, ["forms", "contact"]);
    expect(res.status).toBe(200);
    expect(cms.collections.find).toHaveBeenCalledWith(
      "contact",
      expect.objectContaining({
        tenantId: TEST_TENANT,
        system: true,
        publicationFilter: "all",
      }),
    );
  });
});

describe("CRUD tenant guard body tenantId", () => {
  beforeEach(() => {
    (globalThis as { __privateEnv?: unknown }).__privateEnv = { MULTI_TENANT: true };
    resetGuardCache();
    resetSafeQueryCache();
  });

  it("rejects a data tenantId that differs from the ambient tenant", () => {
    expect(() =>
      enforceDataTenantIdSync(
        { title: "Hello", tenantId: "tenant-b" },
        { tenantId: "tenant-a" as DatabaseId },
      ),
    ).toThrow(/Security Violation|tenant/i);
  });

  it("accepts a matching data tenantId", () => {
    const data = { title: "Hello", tenantId: "tenant-a" as DatabaseId };
    expect(enforceDataTenantIdSync(data, { tenantId: "tenant-a" as DatabaseId })).toEqual(data);
  });

  it("still injects options.tenantId when data omits it", () => {
    expect(
      enforceDataTenantIdSync({ title: "Hello" }, { tenantId: "tenant-a" as DatabaseId }),
    ).toEqual({ title: "Hello", tenantId: "tenant-a" });
  });

  it("rejects a mismatched tenant through the guarded CRUD insert", async () => {
    const inner = {
      insert: vi.fn().mockResolvedValue({ success: true, data: { _id: "1" } }),
    } as unknown as ICrudAdapter;
    const guard = createTenantGuardedCrud(inner, "reject");

    await expect(
      guard.insert("posts", { title: "Hello", tenantId: "tenant-b" } as never, {
        tenantId: "tenant-a" as DatabaseId,
      }),
    ).rejects.toThrow(/Security Violation|tenant/i);
    expect(inner.insert).not.toHaveBeenCalled();
  });
});
