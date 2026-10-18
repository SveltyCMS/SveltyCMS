/**
 * @file tests/unit/services/ai-moderation.test.ts
 * @description Unit tests for the fail-closed AI moderation boundary.
 *
 * ### Features:
 * - no provider configured ⇒ allowed (documented opt-out)
 * - configured provider verdict (allowed / flagged)
 * - unreachable, non-2xx, malformed, and missing-endpoint providers fail closed
 * - egress guard is consulted before the request
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@utils/error-handling";

const { getSettingMock, safeFetchMock, validateEgressUrlMock } = vi.hoisted(() => ({
  getSettingMock: vi.fn<(key: string) => Promise<unknown>>(async () => undefined),
  safeFetchMock: vi.fn(),
  validateEgressUrlMock: vi.fn(),
}));

vi.mock("@utils/egress-guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@utils/egress-guard")>();
  return {
    ...actual,
    safeFetch: safeFetchMock,
    validateEgressUrl: validateEgressUrlMock,
  };
});

vi.mock("@src/services/core/settings-service", () => ({
  getUntypedSetting: getSettingMock,
}));

vi.mock("@utils/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { moderateAiText } from "@src/services/ai/moderation";

const MODERATION_KEYS = ["AI_MODERATION_PROVIDER", "AI_MODERATION_URL", "AI_MODERATION_API_KEY"];

function configure(values: Record<string, string>): void {
  getSettingMock.mockImplementation(async (key: string) => values[key]);
}

function isUnavailable(error: unknown): boolean {
  return (
    error instanceof AppError && error.status === 503 && error.code === "MODERATION_UNAVAILABLE"
  );
}

beforeEach(() => {
  getSettingMock.mockReset();
  safeFetchMock.mockReset();
  validateEgressUrlMock.mockReset();
  validateEgressUrlMock.mockImplementation(async (url: string) => new URL(url));
  for (const key of MODERATION_KEYS) delete process.env[key];
});

afterEach(() => {
  for (const key of MODERATION_KEYS) delete process.env[key];
});

describe("moderateAiText", () => {
  it("allows text when no provider is configured", async () => {
    configure({});

    await expect(moderateAiText("ordinary text")).resolves.toEqual({ allowed: true });
    expect(validateEgressUrlMock).not.toHaveBeenCalled();
    expect(safeFetchMock).not.toHaveBeenCalled();
  });

  it("allows text when the configured provider approves it", async () => {
    configure({ AI_MODERATION_URL: "https://moderation.example.com/v1/check" });
    safeFetchMock.mockResolvedValue({
      success: true,
      status: 200,
      body: JSON.stringify({ results: [{ flagged: false }] }),
    });

    await expect(moderateAiText("safe text", { tenantId: "t1" })).resolves.toEqual({
      allowed: true,
    });

    expect(validateEgressUrlMock).toHaveBeenCalledWith("https://moderation.example.com/v1/check");
    expect(validateEgressUrlMock.mock.invocationCallOrder[0]).toBeLessThan(
      safeFetchMock.mock.invocationCallOrder[0],
    );
    expect(safeFetchMock).toHaveBeenCalledWith(
      "https://moderation.example.com/v1/check",
      expect.objectContaining({
        method: "POST",
        timeoutMs: expect.any(Number),
        maxSizeBytes: expect.any(Number),
      }),
    );
  });

  it("blocks text flagged by the provider", async () => {
    configure({ AI_MODERATION_URL: "https://moderation.example.com/v1/check" });
    safeFetchMock.mockResolvedValue({
      success: true,
      status: 200,
      body: JSON.stringify({ flagged: true }),
    });

    await expect(moderateAiText("bad text")).resolves.toEqual({
      allowed: false,
      reason: "moderation_flagged",
    });
  });

  it("fails closed when the provider is unreachable", async () => {
    configure({ AI_MODERATION_URL: "https://moderation.example.com/v1/check" });
    safeFetchMock.mockResolvedValue({ success: false, error: "ECONNREFUSED" });

    await expect(moderateAiText("text")).rejects.toSatisfy(isUnavailable);
  });

  it("fails closed on a non-2xx response", async () => {
    configure({ AI_MODERATION_URL: "https://moderation.example.com/v1/check" });
    safeFetchMock.mockResolvedValue({
      success: true,
      status: 500,
      body: JSON.stringify({ flagged: false }),
    });

    await expect(moderateAiText("text")).rejects.toSatisfy(isUnavailable);
  });

  it("fails closed on an unparseable response", async () => {
    configure({ AI_MODERATION_URL: "https://moderation.example.com/v1/check" });
    safeFetchMock.mockResolvedValue({
      success: true,
      status: 200,
      body: "not-json",
    });

    await expect(moderateAiText("text")).rejects.toSatisfy(isUnavailable);
  });

  it("fails closed when a provider is named but no endpoint is configured", async () => {
    configure({ AI_MODERATION_PROVIDER: "openai" });

    await expect(moderateAiText("text")).rejects.toSatisfy(isUnavailable);
    expect(safeFetchMock).not.toHaveBeenCalled();
  });

  it("falls back to environment configuration", async () => {
    configure({});
    process.env.AI_MODERATION_URL = "https://moderation.example.com/v1/check";
    safeFetchMock.mockResolvedValue({
      success: true,
      status: 200,
      body: JSON.stringify({ allowed: true }),
    });

    await expect(moderateAiText("safe text")).resolves.toEqual({ allowed: true });
  });
});
