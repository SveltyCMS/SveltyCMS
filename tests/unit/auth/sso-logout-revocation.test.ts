/**
 * @file tests/unit/auth/sso-logout-revocation.test.ts
 * @description An IdP-driven SSO logout must destroy the CMS session, not only its SSO metadata.
 *
 * WHY: all three logout paths (RP-initiated, front-channel, back-channel) deleted the SSO
 * metadata and nothing else, so the session row stayed valid and the user was still signed
 * in afterwards — for up to the session lifetime. performRpInitiatedLogout even documents
 * "Destroys the local session" as its step 4.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteSession: vi.fn(async () => ({ success: true })),
  invalidateSessionCache: vi.fn(),
}));

vi.mock("@src/databases/db", () => ({
  getDb: () => ({ auth: { deleteSession: mocks.deleteSession } }),
}));
vi.mock("@src/hooks/handle-authentication", () => ({
  invalidateSessionCache: mocks.invalidateSessionCache,
}));
vi.mock("@src/databases/cache/cache-service", () => ({
  cacheService: {
    get: vi.fn(async () => null),
    set: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
  },
}));

import {
  handleFrontChannelLogout,
  registerSsoProvider,
  setSsoSessionMetadata,
  getSsoSessionMetadata,
} from "@src/databases/auth/sso-session";

describe("SSO logout destroys the CMS session", () => {
  beforeEach(() => {
    mocks.deleteSession.mockClear();
    mocks.invalidateSessionCache.mockClear();
  });

  it("front-channel logout deletes the session and drops its metadata", async () => {
    registerSsoProvider({
      id: "op-front",
      issuer: "https://issuer.example",
      clientId: "cid",
    } as never);
    await setSsoSessionMetadata("sess-front", {
      provider: "op-front",
      createdAt: new Date().toISOString(),
      // The OP names the session by `sid`; metadata without it cannot be targeted
      // and is deliberately left alive (see sso-logout-scoping.test.ts).
      oidcSid: "sid-front",
    });

    await handleFrontChannelLogout("https://issuer.example", "sid-front");

    expect(mocks.deleteSession).toHaveBeenCalledWith("sess-front", undefined);
    expect(mocks.invalidateSessionCache).toHaveBeenCalled();
    expect(await getSsoSessionMetadata("sess-front")).toBeFalsy();
  });
});
