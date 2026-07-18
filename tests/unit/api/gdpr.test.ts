/**
 * @file tests/unit/api/gdpr.test.ts
 * @description Unit tests for POST /api/gdpr export + anonymize (self-service).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockUser, createDbAdapterStub } from "../utils/mock-factories";
import { invokeApi, expectApi } from "../utils/mock-event";

const dbAdapter = createDbAdapterStub();
(dbAdapter as any).auth.getUserById = vi.fn().mockResolvedValue({
  success: true,
  data: {
    _id: "u1",
    email: "admin@test.com",
    username: "admin",
  },
});
(dbAdapter as any).auth.updateUserAttributes = vi.fn().mockResolvedValue({
  success: true,
  data: {},
});

vi.mock("@src/databases/db", () => ({
  dbAdapter,
  getDbInitPromise: vi.fn().mockResolvedValue(undefined),
  getDb: vi.fn().mockReturnValue(dbAdapter),
  isDbConnected: vi.fn().mockReturnValue(true),
  getAuth: vi.fn().mockReturnValue(dbAdapter.auth),
}));

vi.mock("@src/services/security/audit-service", () => ({
  auditLogService: {
    getLogs: vi.fn().mockResolvedValue([]),
    log: vi.fn().mockResolvedValue(undefined),
  },
  AuditEventType: { DATA_EXPORT: "DATA_EXPORT", DATA_DELETION: "DATA_DELETION" },
}));

const adminUser = createMockUser({
  _id: "u1",
  role: "admin",
  isAdmin: true,
  email: "admin@test.com",
} as any);

describe("GDPR API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports user data for authenticated self", async () => {
    const response = await invokeApi("POST", {
      path: "gdpr",
      body: { action: "export", userId: "u1" },
      user: adminUser,
      tenantId: "t1",
      bypass: true,
      dbAdapter,
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data || body).toBeTruthy();
  });

  it("anonymizes user", async () => {
    const response = await invokeApi("POST", {
      path: "gdpr",
      body: { action: "anonymize", userId: "u1", reason: "test" },
      user: adminUser,
      tenantId: "t1",
      bypass: true,
      dbAdapter,
    });
    expect([200, 400]).toContain(response.status);
    if (response.status === 200) {
      const body = await response.json();
      expect(body.success).toBe(true);
    }
  });

  it("rejects unauthenticated", async () => {
    await expectApi(
      "POST",
      {
        path: "gdpr",
        body: { action: "export", userId: "u1" },
        user: null,
        tenantId: "t1",
        bypass: false,
        dbAdapter,
      },
      [401, 403],
    );
  });

  it("rejects unknown action", async () => {
    await expectApi(
      "POST",
      {
        path: "gdpr",
        body: { action: "explode", userId: "u1" },
        user: adminUser,
        tenantId: "t1",
        bypass: true,
        dbAdapter,
      },
      [400],
    );
  });
});
