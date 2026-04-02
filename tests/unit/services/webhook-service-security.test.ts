/**
 * @file tests/unit/services/webhook-service-security.test.ts
 * @description Unit tests for WebhookService security, focusing on cache and tenant isolation.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { WebhookService, type WebhookEvent } from "@src/services/webhook-service";

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    system: {
      preferences: {
        get: vi.fn(),
        set: vi.fn(),
      },
    },
  },
}));

vi.mock("@src/databases/db", () => ({
  dbAdapter: mockDb,
  getDbInitPromise: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@utils/logger.server", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock jobQueue (we'll control dispatch behavior)
const mockDispatch = vi.fn().mockResolvedValue("job-123");

vi.mock("@src/services/jobs/job-queue-service", () => ({
  jobQueue: {
    dispatch: mockDispatch,
  },
}));

describe("WebhookService Security - Tenant Isolation", () => {
  let service: WebhookService;
  const tenant1 = "tenant-1";
  const tenant2 = "tenant-2";

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Reset singleton
    // @ts-expect-error - testing private singleton
    WebhookService.instance = null;

    service = WebhookService.getInstance();
    service.clearCache();
  });

  it("should maintain separate caches for different tenants", async () => {
    const hooks1 = [
      {
        id: "h1",
        name: "Hook 1",
        tenantId: tenant1,
        events: ["*"] as WebhookEvent[],
        url: "http://t1.com",
        active: true,
      },
    ];

    const hooks2 = [
      {
        id: "h2",
        name: "Hook 2",
        tenantId: tenant2,
        events: ["*"] as WebhookEvent[],
        url: "http://t2.com",
        active: true,
      },
    ];

    mockDb.system.preferences.get.mockImplementation(
      (_key: string, _scope: string, tId?: string) => {
        if (tId === tenant1) return Promise.resolve({ success: true, data: hooks1 });
        if (tId === tenant2) return Promise.resolve({ success: true, data: hooks2 });
        return Promise.resolve({ success: true, data: [] });
      },
    );

    const result1 = await service.getWebhooks(tenant1);
    const result2 = await service.getWebhooks(tenant2);

    expect(result1).toEqual(hooks1);
    expect(result2).toEqual(hooks2);

    // Should have hit DB twice (once per tenant)
    expect(mockDb.system.preferences.get).toHaveBeenCalledTimes(2);

    // Second calls should use cache → no additional DB calls
    await service.getWebhooks(tenant1);
    await service.getWebhooks(tenant2);

    expect(mockDb.system.preferences.get).toHaveBeenCalledTimes(2);
  });

  it("should only trigger webhooks for the specified tenant", async () => {
    const hooks1 = [
      {
        id: "h1",
        name: "Hook 1",
        tenantId: tenant1,
        events: ["entry:create"] as WebhookEvent[],
        url: "http://t1.com",
        active: true,
      },
    ];

    const hooks2 = [
      {
        id: "h2",
        name: "Hook 2",
        tenantId: tenant2,
        events: ["entry:create"] as WebhookEvent[],
        url: "http://t2.com",
        active: true,
      },
    ];

    mockDb.system.preferences.get.mockImplementation((_key: any, _scope: any, tId?: string) => {
      if (tId === tenant1) return Promise.resolve({ success: true, data: hooks1 });
      if (tId === tenant2) return Promise.resolve({ success: true, data: hooks2 });
      return Promise.resolve({ success: true, data: [] });
    });

    // Trigger only for tenant 1
    await service.trigger("entry:create", { some: "data" }, tenant1);

    // Wait for async job dispatch
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockDispatch).toHaveBeenCalledTimes(1);

    const [jobType, payload, tId] = mockDispatch.mock.calls[0] as any;

    expect(jobType).toBe("webhook-delivery");
    expect(payload.webhook.id).toBe("h1");
    expect(tId).toBe(tenant1);
  });

  it("should enforce tenantId when saving webhooks", async () => {
    mockDb.system.preferences.get.mockResolvedValue({ success: true, data: [] });
    mockDb.system.preferences.set.mockResolvedValue({ success: true });

    const newHook = {
      name: "New Hook",
      url: "http://new.com",
      events: ["entry:create"] as WebhookEvent[],
    };

    await service.saveWebhook(newHook, tenant1);

    expect(mockDb.system.preferences.set).toHaveBeenCalledWith(
      "webhooks_config",
      expect.arrayContaining([
        expect.objectContaining({
          tenantId: tenant1,
          name: "New Hook",
        }),
      ]),
      "system",
      tenant1,
    );
  });
});
