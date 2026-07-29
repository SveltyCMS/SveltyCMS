/**
 * @file tests/unit/routes/webhooks-page-server.test.ts
 * @description Admin gate for webhooks list + logs loaders.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@utils/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), trace: vi.fn() },
}));

vi.mock("@utils/page-guards.server", () => ({
  getAuthenticatedUser: vi.fn((locals: any) => {
    if (!locals?.user) {
      const err = new Error("redirect") as Error & { status: number };
      err.status = 302;
      throw err;
    }
    return locals.user;
  }),
}));

import { load as loadWebhooks } from "../../../src/routes/(app)/config/webhooks/+page.server";
import { load as loadLogs } from "../../../src/routes/(app)/config/webhooks/logs/+page.server";

describe("webhooks +page.server", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows admin", async () => {
    const data: any = await loadWebhooks({
      locals: { user: { _id: "u1" }, isAdmin: true },
    } as any);
    expect(data.isAdmin).toBe(true);
  });

  it("throws 403 for non-admin", async () => {
    await expect(
      loadWebhooks({ locals: { user: { _id: "u2" }, isAdmin: false } } as any),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("webhook logs +page.server", () => {
  it("allows admin / rejects non-admin", async () => {
    await expect(
      loadLogs({ locals: { user: { _id: "u1" }, isAdmin: true } } as any),
    ).resolves.toMatchObject({ isAdmin: true });
    await expect(
      loadLogs({ locals: { user: { _id: "u2" }, isAdmin: false } } as any),
    ).rejects.toMatchObject({ status: 403 });
  });
});
