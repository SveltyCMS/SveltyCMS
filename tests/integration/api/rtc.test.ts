/**
 * @file tests/integration/api/rtc.test.ts
 * @description Integration tests for Real-Time Collaboration (SSE) API.
 *
 * Note: safeFetch must not buffer event-stream bodies (see helpers/server.ts).
 */

import { beforeAll, describe, expect, it } from "vitest";
import { getApiBaseUrl, safeFetch } from "../helpers/server";
import { prepareAuthenticatedContext } from "../helpers/test-setup";

const API_BASE_URL = getApiBaseUrl();

describe("RTC (SSE) Integration", () => {
  let adminCookie: string;

  // 1. ONE-TIME SETUP
  beforeAll(async () => {
    // prepareAuthenticatedContext handles reset, seed, and login
    adminCookie = await prepareAuthenticatedContext();
  }, 30_000); // 30s timeout

  // --- TEST SUITE: SSE CONNECTION ---
  describe("GET /api/events", () => {
    it('should establish an SSE connection and receive "connected" message', async () => {
      const response = await safeFetch(`${API_BASE_URL}/api/events`, {
        headers: {
          Cookie: adminCookie,
          Accept: "text/event-stream",
        },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toContain("text/event-stream");
      const cacheControl = response.headers.get("Cache-Control");
      expect(cacheControl).toBeDefined();
      expect(cacheControl).toContain("no-cache");
      // Connection may be hop-by-hop and stripped by some proxies; soft-check
      const connection = response.headers.get("Connection");
      if (connection) expect(connection.toLowerCase()).toBe("keep-alive");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader available");

      try {
        // First frames may arrive split; read until "connected" or budget expires
        const decoder = new TextDecoder();
        let text = "";
        const deadline = Date.now() + 8_000;
        while (Date.now() < deadline && !text.includes("connected")) {
          const { value, done } = await reader.read();
          if (done) break;
          text += decoder.decode(value, { stream: true });
        }
        console.log("SSE First Message:", text.slice(0, 500));
        expect(text).toContain("connected");
      } finally {
        await reader.cancel().catch(() => {});
      }
    }, 15_000);

    it("should reject unauthenticated requests", async () => {
      const response = await safeFetch(`${API_BASE_URL}/api/events`);
      expect(response.status).toBe(401);
    });
  });
});
