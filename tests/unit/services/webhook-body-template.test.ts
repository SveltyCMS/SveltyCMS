/**
 * @file tests/unit/services/webhook-body-template.test.ts
 * @description Pins fixed-placeholder body rendering, the 64 KiB rendered-body
 * cap, and the invariant that a template cannot influence URL/method/headers.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { safeFetchMock } = vi.hoisted(() => ({ safeFetchMock: vi.fn() }));

vi.mock("@utils/egress-guard", () => ({ safeFetch: safeFetchMock }));

vi.mock("@src/services/background/jobs/webhook-circuit-breaker", () => ({
  beforeWebhookRequest: vi.fn(),
  recordWebhookFailure: vi.fn(),
  recordWebhookSuccess: vi.fn(),
}));

vi.mock("@utils/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  WEBHOOK_BODY_TEMPLATE_MAX_BYTES,
  webhookBodyTemplateError,
  webhookCollectionError,
} from "@src/services/background/webhook-body";
import {
  renderWebhookBody,
  resolveWebhookCollection,
  resolveWebhookEntryId,
  WebhookBodyTooLargeError,
  type WebhookBodyTemplateContext,
} from "@src/services/background/webhook-body-render.server";
import { webhookDeliveryHandler } from "@src/services/background/jobs/webhook-jobs";
import type { Webhook } from "@src/services/background/webhook-service";

const payload = { collection: "posts", id: "entry-1", title: "Hello" };
const context: WebhookBodyTemplateContext = {
  event: "entry:create",
  collection: resolveWebhookCollection(payload),
  entryId: resolveWebhookEntryId(payload),
  timestamp: "2026-01-02T03:04:05.000Z",
  webhookId: "hook-1",
  payload,
};

function makeWebhook(partial: Partial<Webhook> = {}): Webhook {
  return {
    id: "hook-1",
    name: "Hook",
    url: "https://example.test/hook",
    events: ["entry:create"],
    active: true,
    tenantId: "tenant-1",
    ...partial,
  };
}

interface FetchedOptions {
  body: string;
  headers: Record<string, string>;
  method: string;
}

describe("renderWebhookBody", () => {
  it("replaces every supported placeholder", () => {
    expect(renderWebhookBody("{{event}}", context)).toBe("entry:create");
    expect(renderWebhookBody("{{collection}}", context)).toBe("posts");
    expect(renderWebhookBody("{{entryId}}", context)).toBe("entry-1");
    expect(renderWebhookBody("{{timestamp}}", context)).toBe(context.timestamp);
    expect(renderWebhookBody("{{webhookId}}", context)).toBe("hook-1");
    expect(renderWebhookBody("{{payload}}", context)).toBe(JSON.stringify(payload));
  });

  it("leaves unknown placeholders and property paths literal", () => {
    expect(renderWebhookBody("{{unknown}} {{payload.title}} {{event}}", context)).toBe(
      "{{unknown}} {{payload.title}} entry:create",
    );
  });

  it("does not re-interpret placeholders that appear inside a value", () => {
    const rendered = renderWebhookBody("{{payload}}", {
      ...context,
      payload: { note: "{{event}}" },
    });
    expect(rendered).toBe('{"note":"{{event}}"}');
  });

  it("fails with a clear error when the rendered body exceeds 64 KiB", () => {
    const huge = { blob: "x".repeat(WEBHOOK_BODY_TEMPLATE_MAX_BYTES) };

    expect(() => renderWebhookBody("{{payload}}", { ...context, payload: huge })).toThrow(
      WebhookBodyTooLargeError,
    );
    expect(() => renderWebhookBody("{{payload}}", { ...context, payload: huge })).toThrow(
      new RegExp(`${WEBHOOK_BODY_TEMPLATE_MAX_BYTES}`),
    );
  });
});

describe("webhook filter validation", () => {
  it("accepts undefined/empty and rejects whitespace-only collections", () => {
    expect(webhookCollectionError(undefined)).toBeUndefined();
    expect(webhookCollectionError("")).toBeUndefined();
    expect(webhookCollectionError("*")).toBeUndefined();
    expect(webhookCollectionError("posts")).toBeUndefined();
    expect(webhookCollectionError("   ")).toMatch(/non-empty/);
  });

  it("caps the template at 64 KiB", () => {
    expect(webhookBodyTemplateError(undefined)).toBeUndefined();
    expect(webhookBodyTemplateError("")).toBeUndefined();
    expect(webhookBodyTemplateError("x".repeat(WEBHOOK_BODY_TEMPLATE_MAX_BYTES))).toBeUndefined();
    expect(webhookBodyTemplateError("x".repeat(WEBHOOK_BODY_TEMPLATE_MAX_BYTES + 1))).toMatch(
      new RegExp(`${WEBHOOK_BODY_TEMPLATE_MAX_BYTES}`),
    );
  });
});

describe("webhookDeliveryHandler body templates", () => {
  beforeEach(() => {
    safeFetchMock.mockReset();
    safeFetchMock.mockResolvedValue({ success: true, status: 200 });
  });

  it("cannot influence the URL, method or headers", async () => {
    const webhook = makeWebhook({
      headers: { "X-Test": "1" },
      bodyTemplate: '{"event":"{{event}}","url":"https://evil.test","header":"X-Evil: injected"}',
    });

    await webhookDeliveryHandler({
      webhook,
      event: "entry:create",
      payload: { collection: "posts", id: "entry-1" },
    });

    const call = safeFetchMock.mock.calls[0];
    if (!call) throw new Error("expected a delivery");
    const [url, options] = call as [string, FetchedOptions];

    expect(url).toBe("https://example.test/hook");
    expect(options.method).toBe("POST");
    expect(options.headers).toMatchObject({
      "Content-Type": "application/json",
      "X-SveltyCMS-Event": "entry:create",
      "X-Test": "1",
    });
    expect(Object.keys(options.headers)).not.toContain("X-Evil");
    expect(options.body).toBe(
      '{"event":"entry:create","url":"https://evil.test","header":"X-Evil: injected"}',
    );
  });

  it("prefers an explicitly supplied body over the template", async () => {
    await webhookDeliveryHandler({
      webhook: makeWebhook({ bodyTemplate: '{"event":"{{event}}"}' }),
      event: "entry:create",
      payload,
      body: '{"override":true}',
    });

    const call = safeFetchMock.mock.calls[0];
    if (!call) throw new Error("expected a delivery");
    const [, options] = call as [string, FetchedOptions];

    expect(options.body).toBe('{"override":true}');
  });

  it("routes an oversized rendered body to the permanent-failure path", async () => {
    await expect(
      webhookDeliveryHandler({
        webhook: makeWebhook({ bodyTemplate: "{{payload}}" }),
        event: "entry:create",
        payload: { blob: "x".repeat(WEBHOOK_BODY_TEMPLATE_MAX_BYTES) },
      }),
    ).rejects.toThrow(new RegExp(`PERMANENT_FAILURE.*${WEBHOOK_BODY_TEMPLATE_MAX_BYTES}`, "s"));

    expect(safeFetchMock).not.toHaveBeenCalled();
  });
});
