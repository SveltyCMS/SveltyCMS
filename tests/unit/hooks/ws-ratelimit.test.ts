/**
 * @file tests/unit/hooks/ws-ratelimit.test.ts
 * @description Unit tests for WebSocket rate limiting and peer address resolution.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { upgrade, open, closeAllConnections, type WsUpgradeContext } from "@src/hooks.ws";

vi.mock("@src/databases/db", () => ({
  getDbInitPromise: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@src/services/core/settings-service", () => ({
  loadSettingsCache: vi.fn().mockResolvedValue(undefined),
  getPrivateSettingSync: vi.fn().mockImplementation((key) => {
    if (key === "RATE_LIMITER_WEBSOCKETS_MAX_CONNECTIONS") return "2";
    if (key === "TEST_API_SECRET") return "secret-123";
    return undefined;
  }),
}));

vi.mock("@src/hooks/handle-authentication", () => ({
  resolveSessionForWebSocket: vi.fn().mockResolvedValue({
    ok: true,
    user: { _id: "user-1", email: "u@example.com", role: "admin", isAdmin: true },
    isSecure: false,
  }),
}));

describe("WebSocket IP Resolution & Rate Limiting", () => {
  beforeEach(() => {
    closeAllConnections();
    process.env.RATE_LIMITER_WEBSOCKETS_MAX_CONNECTIONS = "2";
    process.env.TEST_MODE = "false";
    process.env.NODE_ENV = "production";
  });

  afterEach(() => {
    closeAllConnections();
  });

  it("does not trust spoofed x-forwarded-for header and uses transport address", async () => {
    const ctx: WsUpgradeContext = {
      url: "http://localhost/ws",
      headers: {
        "x-forwarded-for": "1.2.3.4, 5.6.7.8",
        cookie: "auth_sessions=valid-session",
      },
      getClientAddress: () => "198.51.100.5",
    };

    const result = await upgrade(ctx);
    expect(result).not.toBe(false);
    if (result) {
      expect(result.clientIp).toBe("198.51.100.5");
      expect(result.clientIp).not.toBe("1.2.3.4");
    }
  });

  it("does not default missing header to 127.0.0.1 (defaults to unknown)", async () => {
    const ctx: WsUpgradeContext = {
      url: "http://localhost/ws",
      headers: {
        cookie: "auth_sessions=valid-session",
      },
    };

    const result = await upgrade(ctx);
    expect(result).not.toBe(false);
    if (result) {
      expect(result.clientIp).toBe("unknown");
      expect(result.clientIp).not.toBe("127.0.0.1");
    }
  });

  it("enforces max connections per IP using verified peer address", async () => {
    const ip = "198.51.100.42";
    const fakeSocket1 = { close: vi.fn() };
    const fakeSocket2 = { close: vi.fn() };

    open(fakeSocket1, ip);
    open(fakeSocket2, ip);

    const ctx: WsUpgradeContext = {
      url: "http://localhost/ws",
      headers: {
        cookie: "auth_sessions=valid-session",
      },
      getClientAddress: () => ip,
    };

    const result = await upgrade(ctx);
    expect(result).toBe(false);
  });
});
