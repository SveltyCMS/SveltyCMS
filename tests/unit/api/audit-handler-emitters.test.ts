/**
 * @file tests/unit/api/audit-handler-emitters.test.ts
 * @description Pins the audit emitters added to mutation handlers.
 *
 * - `PRIVILEGE_ESCALATION` when a non-admin patch carries privileged fields
 *   (self-service update and create-user paths).
 * - `MEDIA_DELETED` on a successful media delete.
 * - `SETTINGS_UPDATED` on a successful system-settings write, without values.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { applyUserAttributeUpdate } from "@utils/server/user-attribute-update.server";
import { handleCreateUser } from "@src/routes/api/[...path]/handlers/auth";
import { handleMediaPostDelete } from "@src/routes/api/[...path]/handlers/media";
import { handleSettingsRoutes } from "@src/routes/api/[...path]/handlers/system/system-settings";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/databases/db-interface";

const auditMocks = vi.hoisted(() => ({
  log: vi.fn().mockResolvedValue(undefined),
  logEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@src/services/security/audit-service", () => ({
  auditLogService: { log: auditMocks.log, logEvent: auditMocks.logEvent },
  AuditEventType: {
    PRIVILEGE_ESCALATION: "privilege_escalation",
    MEDIA_UPLOADED: "media_uploaded",
    MEDIA_DELETED: "media_deleted",
    SETTINGS_UPDATED: "settings_updated",
  },
}));

vi.mock("@src/hooks/handle-authentication", () => ({
  invalidateSessionCache: vi.fn(),
  primeSessionMemoryCache: vi.fn(),
}));

vi.mock("@utils/server/layout-caches.server", () => ({
  invalidateLayoutUserCache: vi.fn(),
}));

vi.mock("@src/hooks/handle-turbo-get", () => ({
  invalidateTurboAuthForUser: vi.fn(),
}));

vi.mock("@utils/server/session-reauth.server", () => ({
  verifyReauthToken: vi.fn().mockReturnValue(true),
  verifyUserReauthToken: vi.fn().mockReturnValue(true),
  signReauthToken: vi.fn(),
  signUserReauthToken: vi.fn(),
  REAUTH_TOKEN_TTL_MS: 300_000,
}));

vi.mock("@src/services/security/field-permission-service", () => ({
  invalidateFieldPermissionCache: vi.fn(),
}));

vi.mock("@src/services/security/access-rule-service", () => ({
  invalidateAccessRuleCache: vi.fn(),
}));

const TENANT = "tenant-1" as DatabaseId;

function apiEvent(
  body: Record<string, unknown>,
  user: Record<string, unknown>,
  method = "POST",
): RequestEvent {
  return {
    request: {
      json: async () => body,
      method,
      headers: new Headers(),
    },
    locals: { user, roles: [], isAdmin: user.role === "admin", tenantId: TENANT },
    url: new URL("http://localhost/api/test"),
    cookies: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
    getClientAddress: () => "127.0.0.1",
    setHeaders: vi.fn(),
    params: {},
  } as unknown as RequestEvent;
}

function callsOfType(eventType: string) {
  return auditMocks.log.mock.calls.filter((call: unknown[]) => call[3] === eventType);
}

describe("privilege-escalation audit", () => {
  beforeEach(() => {
    auditMocks.log.mockClear();
  });

  it("emits PRIVILEGE_ESCALATION from the self-service update path", async () => {
    const updateUserAttributes = vi.fn(async (_id: string, _attrs: Record<string, unknown>) => ({
      success: true,
      data: { _id: "user-1", email: "editor@test.de" },
    }));
    const cms = {
      auth: {
        updateUserAttributes,
        getActiveSessions: vi.fn(async () => ({ success: true, data: [] })),
        invalidateAllUserSessions: vi.fn(async () => ({ success: true, data: [] })),
      },
    } as unknown as LocalCMS;
    const event = apiEvent(
      { role: "admin", username: "renamed" },
      { _id: "user-1", email: "editor@test.de", role: "editor" },
    );

    await applyUserAttributeUpdate(event, cms, TENANT, {
      role: "admin",
      username: "renamed",
    });

    const rows = callsOfType("privilege_escalation");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.[1]).toMatchObject({ id: "user-1", email: "editor@test.de" });
    expect(rows[0]?.[5]).toMatchObject({ strippedFields: ["role"] });
    const updates = updateUserAttributes.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(updates).not.toHaveProperty("role");
  });

  it("emits PRIVILEGE_ESCALATION from the create-user path", async () => {
    const createUser = vi.fn(async (payload: Record<string, unknown>) => ({
      success: true,
      data: { _id: "new-user", email: "new@test.de", ...payload },
    }));
    const cms = { auth: { createUser } } as unknown as LocalCMS;
    const event = apiEvent(
      { email: "new@test.de", password: "ValidPass1!", role: "admin" },
      { _id: "manager-1", email: "manager@test.de", role: "editor" },
    );

    await handleCreateUser(event, cms, TENANT);

    const rows = callsOfType("privilege_escalation");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.[1]).toMatchObject({ id: "manager-1", email: "manager@test.de" });
    expect(rows[0]?.[5]).toMatchObject({
      operation: "create_user",
      strippedFields: ["role"],
    });
    const payload = createUser.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("role");
  });
});

describe("media and settings audit", () => {
  beforeEach(() => {
    auditMocks.log.mockClear();
  });

  it("emits MEDIA_DELETED after a successful delete", async () => {
    const cms = {
      media: {
        getPublishedReferences: vi.fn(async () => []),
        delete: vi.fn(async () => ({ success: true })),
      },
    } as unknown as LocalCMS;
    const event = apiEvent(
      { id: "media-1" },
      { _id: "media-admin", email: "media@test.de", role: "admin" },
    );

    await handleMediaPostDelete(event, cms, TENANT);

    const rows = callsOfType("media_deleted");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.[2]).toMatchObject({ type: "media", id: "media-1" });
    expect(rows[0]?.[1]).toMatchObject({ id: "media-admin" });
  });

  it("emits SETTINGS_UPDATED with key names but no values", async () => {
    const set = vi.fn(async () => ({ success: true, data: { saved: true } }));
    const cms = {
      system: { settings: { set } },
    } as unknown as LocalCMS;
    const event = apiEvent(
      { siteName: "Secret Site", smtpPassword: "hunter2" },
      { _id: "sys-admin", email: "sys@test.de", role: "admin" },
    );

    await handleSettingsRoutes(event, cms, TENANT, ["settings", "general"]);

    const rows = callsOfType("settings_updated");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.[5]).toMatchObject({
      group: "general",
      keys: ["siteName", "smtpPassword"],
    });
    expect(JSON.stringify(rows[0])).not.toContain("hunter2");
  });
});
