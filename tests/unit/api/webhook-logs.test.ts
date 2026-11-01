/**
 * @file tests/unit/api/webhook-logs.test.ts
 * @description Delivery-log / DLQ branch of `handleWebhookRoutes` (F6).
 *
 * Regression: `/config/webhooks/logs` requests `GET /api/webhooks/logs`, which
 * used to fall through to the webhook-id lookup and throw
 * `Webhook logs not found` (404) — surfacing as a red toast on a normal, empty
 * delivery log. Only the service boundary is mocked.
 *
 * ### Features tested
 * - `logs` resolves BEFORE the webhook-id lookup
 * - empty list → `{ success: true, data: [] }` (no error)
 * - status/limit query forwarding
 * - retry route requeues a delivery; unknown delivery → 404
 * - admin gate and unsupported methods on the logs sub-resource
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";
import { handleWebhookRoutes } from "@src/routes/api/[...path]/handlers/system/system-webhooks";
import { webhookService } from "@src/services/background/webhook-service";

vi.mock("@src/services/background/webhook-service", () => ({
  webhookService: {
    getTenantLogs: vi.fn(),
    getWebhooks: vi.fn(),
    retryDelivery: vi.fn(),
  },
}));

vi.mock("@src/services/security/audit-service", () => ({
  auditLogService: { log: vi.fn() },
  AuditEventType: {
    WEBHOOK_CREATED: "webhook_created",
    WEBHOOK_UPDATED: "webhook_updated",
    WEBHOOK_DELETED: "webhook_deleted",
  },
}));

const ADMIN = { _id: "admin-1", email: "admin@example.com", role: "admin", isAdmin: true };

function makeEvent(method: string, path: string, user: unknown = ADMIN): RequestEvent {
  return {
    locals: { user },
    url: new URL(`http://localhost${path}`),
    request: { method, headers: new Headers(), json: vi.fn() },
    getClientAddress: () => "127.0.0.1",
  } as unknown as RequestEvent;
}

/** Segments the dispatcher passes: namespace first, query string excluded. */
function segmentsFor(path: string): string[] {
  return new URL(`http://localhost${path}`).pathname
    .replace(/^\/api\//, "")
    .split("/")
    .filter(Boolean);
}

async function dispatch(
  method: string,
  path: string,
  user: unknown = ADMIN,
): Promise<{ status: number; body: { success: boolean; data?: unknown; message?: string } }> {
  const response = await handleWebhookRoutes(
    makeEvent(method, path, user),
    {} as never,
    "tenant-1" as never,
    segmentsFor(path),
  );
  if (!response) throw new Error("handler returned no response");
  return { status: response.status, body: await response.json() };
}

describe("GET /api/webhooks/logs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(webhookService.getTenantLogs).mockResolvedValue([]);
  });

  it("returns an empty list as a success envelope — never a 404", async () => {
    const { status, body } = await dispatch("GET", "/api/webhooks/logs");

    expect(status).toBe(200);
    expect(body).toEqual({ success: true, data: [] });
    // The `logs` segment must never be treated as a webhook id.
    expect(webhookService.getWebhooks).not.toHaveBeenCalled();
  });

  it("returns the tenant's projected delivery log entries", async () => {
    vi.mocked(webhookService.getTenantLogs).mockResolvedValue([
      {
        _id: "job-1",
        webhookId: "hook-1",
        webhookName: "Deploy Hook",
        event: "entry:publish",
        status: "failed",
        attempts: 3,
        maxAttempts: 3,
        lastError: "PERMANENT_FAILURE: HTTP 410",
        createdAt: "2026-11-01T10:00:00.000Z",
        updatedAt: "2026-11-01T10:00:05.000Z",
      },
    ]);

    const { status, body } = await dispatch("GET", "/api/webhooks/logs");

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(webhookService.getTenantLogs).toHaveBeenCalledWith("tenant-1", {
      limit: undefined,
      status: undefined,
    });
  });

  it("forwards the status filter and limit to the service", async () => {
    await dispatch("GET", "/api/webhooks/logs?status=failed&limit=10");

    expect(webhookService.getTenantLogs).toHaveBeenCalledWith("tenant-1", {
      limit: 10,
      status: "failed",
    });
  });

  it("rejects a non-admin caller", async () => {
    await expect(
      dispatch("GET", "/api/webhooks/logs", { _id: "u-1", role: "editor" }),
    ).rejects.toMatchObject({ status: 403 });
    expect(webhookService.getTenantLogs).not.toHaveBeenCalled();
  });

  it("rejects unsupported methods on the logs collection", async () => {
    await expect(dispatch("DELETE", "/api/webhooks/logs")).rejects.toMatchObject({ status: 405 });
  });
});

describe("POST /api/webhooks/logs/:id/retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(webhookService.retryDelivery).mockResolvedValue(undefined);
  });

  it("requeues the delivery for the current tenant", async () => {
    const { status, body } = await dispatch("POST", "/api/webhooks/logs/job-1/retry");

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(webhookService.retryDelivery).toHaveBeenCalledWith("job-1", "tenant-1");
  });

  it("maps an unknown or foreign delivery to 404", async () => {
    vi.mocked(webhookService.retryDelivery).mockRejectedValue(
      new Error("Webhook delivery job-x not found"),
    );

    await expect(dispatch("POST", "/api/webhooks/logs/job-x/retry")).rejects.toMatchObject({
      status: 404,
      message: "Webhook delivery job-x not found",
    });
  });
});
