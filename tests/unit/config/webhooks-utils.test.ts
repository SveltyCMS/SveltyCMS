/**
 * @file tests/unit/config/webhooks-utils.test.ts
 * @description Unit tests for webhook manager pure helpers.
 */

import { describe, it, expect } from "vitest";
import {
  validateWebhookName,
  validateWebhookUrl,
  validateWebhookDraft,
  filterWebhooksByQuery,
  WEBHOOK_EVENT_TYPES,
} from "../../../src/routes/(app)/config/webhooks/webhooks-utils";

describe("validateWebhookName / Url", () => {
  it("requires name", () => {
    expect(validateWebhookName("")).toMatch(/required/i);
    expect(validateWebhookName("  ok  ")).toBeNull();
  });

  it("validates absolute http(s) URLs", () => {
    expect(validateWebhookUrl("")).toMatch(/required/i);
    expect(validateWebhookUrl("not-a-url")).toMatch(/valid/i);
    expect(validateWebhookUrl("https://hooks.example.com/x")).toBeNull();
    expect(validateWebhookUrl("http://localhost:3000/hook")).toBeNull();
    expect(validateWebhookUrl("http://example.com/hook")).toMatch(/localhost|HTTPS/i);
  });
});

describe("validateWebhookDraft", () => {
  it("requires at least one event", () => {
    const errors = validateWebhookDraft({
      name: "A",
      url: "https://ex.com",
      active: true,
      events: [],
    });
    expect(errors.events).toBeTruthy();
  });

  it("accepts valid draft", () => {
    const errors = validateWebhookDraft({
      name: "A",
      url: "https://ex.com",
      active: true,
      events: ["entry:publish"],
    });
    expect(Object.keys(errors)).toHaveLength(0);
  });
});

describe("filterWebhooksByQuery", () => {
  const rows = [
    { name: "Slack", url: "https://hooks.slack.com/a" },
    { name: "Zapier", url: "https://hooks.zapier.com/b" },
  ];

  it("filters by name or url", () => {
    expect(filterWebhooksByQuery(rows, "slack")).toHaveLength(1);
    expect(filterWebhooksByQuery(rows, "zapier.com")).toHaveLength(1);
    expect(filterWebhooksByQuery(rows, "")).toHaveLength(2);
  });

  it("exports known event types", () => {
    expect(WEBHOOK_EVENT_TYPES).toContain("entry:publish");
    expect(WEBHOOK_EVENT_TYPES).toContain("media:upload");
  });
});
