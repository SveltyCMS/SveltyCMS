/**
 * @file tests/unit/services/webhook-dispatch.test.ts
 * @description Pins the public delivery primitive: one durable
 * `webhook-delivery` job for both configured webhooks and automation flows,
 * carrying the optional rendered body/method/HTTPS policy.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }));

vi.mock("@src/services/background/jobs/job-queue-service", () => ({
  jobQueue: { dispatch },
}));

vi.mock("@utils/benchmark-runtime", () => ({
  isBenchmarkExternalServicesDisabled: () => false,
}));

import { webhookService, type Webhook } from "@src/services/background/webhook-service";

const webhook: Webhook = {
  id: "automation:flow-1",
  name: "Automation: Flow One",
  url: "https://example.com/hook",
  events: ["entry:publish"],
  active: true,
  tenantId: "tenant-1",
  secret: "hmac-secret",
  headers: { "X-Test": "1" },
};

describe("WebhookService.dispatchDelivery", () => {
  beforeEach(() => {
    dispatch.mockClear();
    dispatch.mockResolvedValue("job-1");
  });

  it("queues one webhook-delivery job with the automation options", async () => {
    await webhookService.dispatchDelivery(
      webhook,
      "entry:publish",
      { id: 1 },
      {
        body: '{"rendered":true}',
        method: "PUT",
        allowHttp: false,
      },
    );

    expect(dispatch).toHaveBeenCalledWith(
      "webhook-delivery",
      {
        webhook,
        event: "entry:publish",
        payload: { id: 1 },
        body: '{"rendered":true}',
        method: "PUT",
        allowHttp: false,
      },
      "tenant-1",
    );
  });

  it("defaults the job tenant to global", async () => {
    await webhookService.dispatchDelivery({ ...webhook, tenantId: "" }, "entry:create", {});

    expect(dispatch).toHaveBeenCalledWith(
      "webhook-delivery",
      expect.objectContaining({ event: "entry:create" }),
      "global",
    );
  });
});
