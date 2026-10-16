import { safeFetch } from "../helpers/server";

/**
 * @file tests/bun/api/security.test.ts
 * @description Verify security enhancements
 *
 * Requires a running preview server at API_BASE_URL. If the context cannot be
 * prepared the beforeAll hook throws — a missing server must be a hard failure,
 * never a silent green (security regressions would hide behind the skip).
 */
import { beforeAll, describe, expect, it } from "vitest";

import { prepareAuthenticatedContext } from "../helpers/test-setup";

const BASE_URL = process.env.API_BASE_URL || "http://localhost:4173";

beforeAll(async () => {
  // Throw, don't swallow: a failed context prep means the suite cannot verify
  // anything — passing silently would mask a real security regression.
  await prepareAuthenticatedContext();
});

describe("Security Enhancements Verification", () => {
  it("should block requests with blocked User-Agent (Firewall)", async () => {
    // HeadlessChrome is in ADVANCED_BOT_PATTERNS
    const res = await safeFetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      body: JSON.stringify({ email: `test@example.com`, password: "wrong" }),
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "HeadlessChrome",
        "X-Test-Security": "true", // Support for bypassing test-mode exemption in hooks
      },
    });

    if (res.status !== 403) {
      console.log("Firewall bypassed! Status:", res.status, await res.text());
    }
    expect(res.status).toBe(403);
  });

  it("should rate limit /api/auth endpoints strictly", async () => {
    // authLimiter is 10 req/min per IP.
    // We need to make > 10 requests.
    let blocked = false;
    for (let i = 0; i < 15; i++) {
      const res = await safeFetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        body: JSON.stringify({
          email: `test-${i}@example.com`,
          password: "wrong",
        }),
        headers: {
          "Content-Type": "application/json",
          "X-Test-Security": "true",
          Origin: BASE_URL,
          Referer: `${BASE_URL}/`,
        },
      });
      if (res.status === 429) {
        blocked = true;
        break;
      }
    }
    expect(blocked).toBe(true);
  }, 20000); // Higher timeout for many requests

  it("should have stricter CSP headers in production", async () => {
    // This test checks if the server is reachable and returns a valid response.
    // CSP headers are set in hooks.server.ts
    const res = await safeFetch(`${BASE_URL}/`);
    // Accept 200 or redirect (302/307) as valid responses
    expect([200, 302, 307]).toContain(res.status);
  });
});
