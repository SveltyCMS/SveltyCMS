/**
 * @file tests/unit/services/webhook-circuit-breaker.test.ts
 * @description Pins the process-local per-origin webhook circuit breaker and its
 * wiring into `webhookDeliveryHandler`: the threshold/window state machine, the
 * single half-open probe, and that an open circuit short-circuits before
 * `safeFetch` is ever called.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { safeFetchMock } = vi.hoisted(() => ({ safeFetchMock: vi.fn() }));

vi.mock("@utils/egress-guard", () => ({ safeFetch: safeFetchMock }));

import {
  WEBHOOK_BREAKER_OPEN_MS,
  WEBHOOK_BREAKER_THRESHOLD,
  beforeWebhookRequest,
  recordWebhookFailure,
  recordWebhookSuccess,
  resetWebhookCircuitBreaker,
} from "@src/services/background/jobs/webhook-circuit-breaker";
import { webhookDeliveryHandler } from "@src/services/background/jobs/webhook-jobs";
import type { Webhook } from "@src/services/background/webhook-service";

const ORIGIN = "https://hooks.example.com";
const HOOK_A = `${ORIGIN}/a`;
const HOOK_B = `${ORIGIN}/b`;
const OTHER_ORIGIN_HOOK = "https://other.example.com/hook";
const T0 = 1_700_000_000_000;

function failRetryably(url: string, times: number, now: number): void {
  for (let i = 0; i < times; i++) recordWebhookFailure(url, "retryable", now);
}

describe("webhook circuit breaker state machine", () => {
  beforeEach(() => {
    resetWebhookCircuitBreaker();
  });

  it("keeps the circuit closed below the threshold", () => {
    failRetryably(HOOK_A, WEBHOOK_BREAKER_THRESHOLD - 1, T0);

    expect(beforeWebhookRequest(HOOK_A, T0)).toEqual({ origin: ORIGIN, probe: false });
  });

  it("opens on the fifth consecutive retryable failure", () => {
    failRetryably(HOOK_A, WEBHOOK_BREAKER_THRESHOLD, T0);

    const retryAt = new Date(T0 + WEBHOOK_BREAKER_OPEN_MS).toISOString();
    expect(() => beforeWebhookRequest(HOOK_A, T0 + 1)).toThrow(
      `RETRYABLE_ERROR: CIRCUIT_OPEN ${ORIGIN} until ${retryAt}`,
    );
  });

  it("keys state by origin, not by full URL", () => {
    failRetryably(HOOK_A, WEBHOOK_BREAKER_THRESHOLD, T0);

    expect(() => beforeWebhookRequest(HOOK_B, T0)).toThrow(/CIRCUIT_OPEN/);
    expect(beforeWebhookRequest(OTHER_ORIGIN_HOOK, T0).probe).toBe(false);
  });

  it("resets the failure streak on success", () => {
    failRetryably(HOOK_A, WEBHOOK_BREAKER_THRESHOLD - 1, T0);
    recordWebhookSuccess(HOOK_A);
    failRetryably(HOOK_A, WEBHOOK_BREAKER_THRESHOLD - 1, T0);

    expect(() => beforeWebhookRequest(HOOK_A, T0)).not.toThrow();
  });

  it("stays open for the full 60 s window, then admits a probe", () => {
    failRetryably(HOOK_A, WEBHOOK_BREAKER_THRESHOLD, T0);

    expect(() => beforeWebhookRequest(HOOK_A, T0 + WEBHOOK_BREAKER_OPEN_MS - 1)).toThrow(
      /CIRCUIT_OPEN/,
    );
    expect(beforeWebhookRequest(HOOK_A, T0 + WEBHOOK_BREAKER_OPEN_MS)).toEqual({
      origin: ORIGIN,
      probe: true,
    });
  });

  it("admits exactly one half-open probe at a time", () => {
    failRetryably(HOOK_A, WEBHOOK_BREAKER_THRESHOLD, T0);
    const probeAt = T0 + WEBHOOK_BREAKER_OPEN_MS;

    expect(beforeWebhookRequest(HOOK_A, probeAt).probe).toBe(true);
    expect(() => beforeWebhookRequest(HOOK_A, probeAt + 1)).toThrow(/CIRCUIT_OPEN/);
    expect(() => beforeWebhookRequest(HOOK_B, probeAt + 1)).toThrow(/CIRCUIT_OPEN/);
  });

  it("closes when the half-open probe succeeds", () => {
    failRetryably(HOOK_A, WEBHOOK_BREAKER_THRESHOLD, T0);
    const probeAt = T0 + WEBHOOK_BREAKER_OPEN_MS;
    beforeWebhookRequest(HOOK_A, probeAt);

    recordWebhookSuccess(HOOK_A);

    expect(beforeWebhookRequest(HOOK_A, probeAt + 1)).toEqual({ origin: ORIGIN, probe: false });
  });

  it("reopens for another window when the half-open probe fails", () => {
    failRetryably(HOOK_A, WEBHOOK_BREAKER_THRESHOLD, T0);
    const probeAt = T0 + WEBHOOK_BREAKER_OPEN_MS;
    beforeWebhookRequest(HOOK_A, probeAt);

    recordWebhookFailure(HOOK_A, "retryable", probeAt);

    expect(() => beforeWebhookRequest(HOOK_A, probeAt + WEBHOOK_BREAKER_OPEN_MS - 1)).toThrow(
      /CIRCUIT_OPEN/,
    );
    expect(beforeWebhookRequest(HOOK_A, probeAt + WEBHOOK_BREAKER_OPEN_MS).probe).toBe(true);
  });

  it("never trips on permanent failures", () => {
    for (let i = 0; i < WEBHOOK_BREAKER_THRESHOLD * 4; i++) {
      recordWebhookFailure(HOOK_A, "permanent", T0);
    }

    expect(beforeWebhookRequest(HOOK_A, T0)).toEqual({ origin: ORIGIN, probe: false });
  });

  it("does not count permanent failures toward the retryable streak", () => {
    failRetryably(HOOK_A, WEBHOOK_BREAKER_THRESHOLD - 1, T0);
    recordWebhookFailure(HOOK_A, "permanent", T0);

    expect(() => beforeWebhookRequest(HOOK_A, T0)).not.toThrow();
  });

  it("closes a half-open circuit when a probe is rejected as permanent", () => {
    failRetryably(HOOK_A, WEBHOOK_BREAKER_THRESHOLD, T0);
    const probeAt = T0 + WEBHOOK_BREAKER_OPEN_MS;
    beforeWebhookRequest(HOOK_A, probeAt);

    recordWebhookFailure(HOOK_A, "permanent", probeAt);

    expect(beforeWebhookRequest(HOOK_A, probeAt + 1)).toEqual({ origin: ORIGIN, probe: false });
  });

  it("presumes a probe with no recorded outcome lost after one window", () => {
    failRetryably(HOOK_A, WEBHOOK_BREAKER_THRESHOLD, T0);
    const probeAt = T0 + WEBHOOK_BREAKER_OPEN_MS;
    expect(beforeWebhookRequest(HOOK_A, probeAt).probe).toBe(true);

    expect(() => beforeWebhookRequest(HOOK_A, probeAt + WEBHOOK_BREAKER_OPEN_MS - 1)).toThrow(
      /CIRCUIT_OPEN/,
    );
    expect(beforeWebhookRequest(HOOK_A, probeAt + WEBHOOK_BREAKER_OPEN_MS).probe).toBe(true);
  });

  it("fails open for unparseable URLs", () => {
    expect(beforeWebhookRequest("not a url", T0)).toEqual({ origin: "not a url", probe: false });
    expect(() => recordWebhookFailure("not a url", "retryable", T0)).not.toThrow();
    expect(() => recordWebhookSuccess("not a url")).not.toThrow();
  });
});

describe("webhookDeliveryHandler circuit breaker wiring", () => {
  const START = 1_700_000_000_000;

  const webhook: Webhook = {
    id: "webhook-1",
    name: "Orders",
    url: HOOK_A,
    events: ["entry:create"],
    active: true,
    tenantId: "tenant-1",
  };

  const run = () => webhookDeliveryHandler({ webhook, event: "entry:create", payload: { id: 1 } });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    safeFetchMock.mockReset();
    resetWebhookCircuitBreaker();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("short-circuits before safeFetch once the circuit is open", async () => {
    safeFetchMock.mockResolvedValue({ success: false, error: "connect ECONNREFUSED" });

    for (let i = 0; i < WEBHOOK_BREAKER_THRESHOLD; i++) {
      await expect(run()).rejects.toThrow(/RETRYABLE_ERROR/);
    }
    expect(safeFetchMock).toHaveBeenCalledTimes(WEBHOOK_BREAKER_THRESHOLD);

    const retryAt = new Date(START + WEBHOOK_BREAKER_OPEN_MS).toISOString();
    await expect(run()).rejects.toThrow(`RETRYABLE_ERROR: CIRCUIT_OPEN ${ORIGIN} until ${retryAt}`);
    expect(safeFetchMock).toHaveBeenCalledTimes(WEBHOOK_BREAKER_THRESHOLD);
  });

  it("lets the half-open probe reach safeFetch after the window", async () => {
    safeFetchMock.mockResolvedValue({ success: false, error: "connect ECONNREFUSED" });
    for (let i = 0; i < WEBHOOK_BREAKER_THRESHOLD; i++) {
      await expect(run()).rejects.toThrow(/RETRYABLE_ERROR/);
    }

    vi.setSystemTime(START + WEBHOOK_BREAKER_OPEN_MS);
    safeFetchMock.mockResolvedValue({ success: true, status: 200 });

    await expect(run()).resolves.toBeUndefined();
    expect(safeFetchMock).toHaveBeenCalledTimes(WEBHOOK_BREAKER_THRESHOLD + 1);
  });

  it("does not trip on a reachable endpoint that rejects the payload", async () => {
    safeFetchMock.mockResolvedValue({ success: false, status: 400, error: "Bad Request" });

    for (let i = 0; i < WEBHOOK_BREAKER_THRESHOLD + 2; i++) {
      await expect(run()).rejects.toThrow(/PERMANENT_FAILURE: HTTP 400/);
    }

    expect(safeFetchMock).toHaveBeenCalledTimes(WEBHOOK_BREAKER_THRESHOLD + 2);
  });
});
