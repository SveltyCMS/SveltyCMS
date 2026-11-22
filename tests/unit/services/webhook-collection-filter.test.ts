/**
 * @file tests/unit/services/webhook-collection-filter.test.ts
 * @description Pins per-collection webhook filtering across the non-uniform
 * event payloads, plus the save/merge semantics of `collection`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { WEBHOOK_BODY_TEMPLATE_MAX_BYTES } from "@src/services/background/webhook-body";

const { mockDb, mockDispatch } = vi.hoisted(() => ({
  mockDb: {
    system: {
      preferences: {
        get: vi.fn(),
        set: vi.fn(),
      },
    },
  },
  mockDispatch: vi.fn(),
}));

vi.mock("@src/databases/db", () => ({
  dbAdapter: mockDb,
  getDb: vi.fn(() => mockDb),
  isDbConnected: vi.fn(() => true),
  getDbInitPromise: vi.fn(async () => undefined),
}));

vi.mock("@utils/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@utils/benchmark-runtime", () => ({
  isBenchmarkExternalServicesDisabled: () => false,
}));

vi.mock("@src/services/background/jobs/job-queue-service", () => ({
  jobQueue: { dispatch: mockDispatch },
}));

import {
  webhookService,
  type Webhook,
  type WebhookEvent,
} from "@src/services/background/webhook-service";

const TENANT = "tenant-1";

function makeWebhook(partial: Partial<Webhook> = {}): Webhook {
  return {
    id: "hook-1",
    name: "Hook",
    url: "https://example.test/hook",
    events: ["*"],
    active: true,
    tenantId: TENANT,
    ...partial,
  };
}

async function triggerAndFlush(
  payload: unknown,
  event: WebhookEvent = "entry:create",
): Promise<void> {
  await webhookService.trigger(event, payload, TENANT);
  // `trigger` is deliberately fire-and-forget; wait for `_dispatch` to settle.
  await new Promise((resolve) => setTimeout(resolve, 10));
}

function servedWebhook(): Webhook {
  const calls = mockDb.system.preferences.set.mock.calls;
  const stored = calls[calls.length - 1]?.[1] as Webhook[] | undefined;
  if (!stored?.[0]) throw new Error("expected a stored webhook");
  return stored[0];
}

describe("WebhookService collection filter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    webhookService.clearCache();
    mockDispatch.mockResolvedValue("job-1");
    mockDb.system.preferences.get.mockResolvedValue({ success: true, data: [] });
    mockDb.system.preferences.set.mockResolvedValue({ success: true });
  });

  it("delivers when the payload names the configured collection", async () => {
    mockDb.system.preferences.get.mockResolvedValue({
      success: true,
      data: [makeWebhook({ collection: "posts" })],
    });

    await triggerAndFlush({ collection: "posts", id: "entry-1" });

    expect(mockDispatch).toHaveBeenCalledTimes(1);
  });

  it("does not deliver when the payload names another collection", async () => {
    mockDb.system.preferences.get.mockResolvedValue({
      success: true,
      data: [makeWebhook({ collection: "posts" })],
    });

    await triggerAndFlush({ collection: "pages", id: "entry-1" });

    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("delivers for `*` and for an undefined collection filter", async () => {
    mockDb.system.preferences.get.mockResolvedValue({
      success: true,
      data: [makeWebhook({ collection: "*" }), makeWebhook({ id: "hook-2" })],
    });

    await triggerAndFlush({ collection: "pages", id: "entry-1" });

    expect(mockDispatch).toHaveBeenCalledTimes(2);
  });

  it("resolves collections from every known payload shape", async () => {
    mockDb.system.preferences.get.mockResolvedValue({
      success: true,
      data: [makeWebhook({ collection: "posts" })],
    });

    const payloads = [
      { collection: "posts" },
      { collectionName: "posts" },
      { data: { collection: "posts" } },
      { entry: { collection: "posts" } },
      { document: { collection: "posts" } },
    ];

    for (const payload of payloads) {
      mockDispatch.mockClear();
      await triggerAndFlush(payload);
      expect(mockDispatch, JSON.stringify(payload)).toHaveBeenCalledTimes(1);
    }
  });

  it("never filters events that carry no collection (media/config)", async () => {
    mockDb.system.preferences.get.mockResolvedValue({
      success: true,
      data: [makeWebhook({ collection: "posts" })],
    });

    await triggerAndFlush({ id: "media-1", url: "https://cdn.test/a.png" }, "media:upload");
    expect(mockDispatch).toHaveBeenCalledTimes(1);

    mockDispatch.mockClear();
    await triggerAndFlush({ tenantId: TENANT, data: { resourceCounts: {} } }, "config.exported");
    expect(mockDispatch).toHaveBeenCalledTimes(1);

    mockDispatch.mockClear();
    await triggerAndFlush(
      { tenantId: TENANT, data: { collectionCount: 2, resourceCounts: { posts: 5 } } },
      "content.exported",
    );
    expect(mockDispatch).toHaveBeenCalledTimes(1);
  });

  it("keeps collection/bodyTemplate/secret/headers when an update omits them", async () => {
    const existing = makeWebhook({
      collection: "posts",
      bodyTemplate: '{"event":"{{event}}"}',
      secret: "s3cret",
      headers: { "X-Auth": "token" },
    });
    mockDb.system.preferences.get.mockResolvedValue({ success: true, data: [existing] });

    await webhookService.saveWebhook(
      {
        id: existing.id,
        name: "Renamed",
        url: existing.url,
        events: existing.events,
        active: true,
      },
      TENANT,
    );

    expect(servedWebhook()).toMatchObject({
      name: "Renamed",
      collection: "posts",
      bodyTemplate: '{"event":"{{event}}"}',
      secret: "s3cret",
      headers: { "X-Auth": "token" },
    });
  });

  it("clears collection/bodyTemplate on an explicit empty string", async () => {
    const existing = makeWebhook({
      collection: "posts",
      bodyTemplate: '{"event":"{{event}}"}',
      secret: "s3cret",
    });
    mockDb.system.preferences.get.mockResolvedValue({ success: true, data: [existing] });

    await webhookService.saveWebhook(
      {
        id: existing.id,
        name: existing.name,
        url: existing.url,
        events: existing.events,
        collection: "",
        bodyTemplate: "",
      },
      TENANT,
    );

    const saved = servedWebhook();
    expect(saved.collection).toBeUndefined();
    expect(saved.bodyTemplate).toBeUndefined();
    expect(saved.secret).toBe("s3cret");
  });

  it("trims a collection filter before storing it", async () => {
    mockDb.system.preferences.get.mockResolvedValue({ success: true, data: [] });

    await webhookService.saveWebhook(
      { name: "Hook", url: "https://example.test/hook", events: ["*"], collection: "  posts  " },
      TENANT,
    );

    expect(servedWebhook().collection).toBe("posts");
  });

  it("rejects a whitespace-only collection", async () => {
    mockDb.system.preferences.get.mockResolvedValue({ success: true, data: [] });

    await expect(
      webhookService.saveWebhook({ name: "Hook", collection: "   " }, TENANT),
    ).rejects.toThrow(/non-empty/);
    expect(mockDb.system.preferences.set).not.toHaveBeenCalled();
  });

  it("rejects an oversized body template", async () => {
    mockDb.system.preferences.get.mockResolvedValue({ success: true, data: [] });

    await expect(
      webhookService.saveWebhook(
        { name: "Hook", bodyTemplate: "x".repeat(WEBHOOK_BODY_TEMPLATE_MAX_BYTES + 1) },
        TENANT,
      ),
    ).rejects.toThrow(new RegExp(`${WEBHOOK_BODY_TEMPLATE_MAX_BYTES}`));
    expect(mockDb.system.preferences.set).not.toHaveBeenCalled();
  });
});
