/**
 * @file tests/unit/hooks/cors-preflight.test.ts
 * @description Verifies the SINGLE canonical CORS preflight handler — the
 * turbo-pipeline fast exit. Every `/api/` OPTIONS request short-circuits there
 * (allowlist validation + CORS + security headers + request-id); the API
 * dispatcher and handlers intentionally carry no preflight logic of their own.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";
import { handleTurboPipeline } from "@src/hooks/handle-turbo-pipeline.server";
import { invalidateSetupCache } from "@utils/server/setup-check";

// Use global mockSetupCheck from tests/unit/bun-preload.ts
const mockSetupCheck = (globalThis as any).mockSetupCheck;

function createPreflightEvent(
  pathname: string,
  origin: string | null,
  method = "OPTIONS",
): RequestEvent {
  const url = new URL(pathname, "http://localhost");
  const headers = new Headers();
  if (origin) headers.set("Origin", origin);
  return {
    url,
    request: new Request(url.toString(), { method, headers }),
    locals: {},
    cookies: {
      get: vi.fn(() => null),
      set: vi.fn(() => ({})),
      delete: vi.fn(() => ({})),
    },
  } as unknown as RequestEvent;
}

describe("CORS preflight — single canonical handler (turbo-pipeline)", () => {
  beforeEach(() => {
    mockSetupCheck.setSetupComplete(true);
    invalidateSetupCache();
    // Drive the settings-service mock (tests/unit/setup.ts reads globalThis.privateEnv).
    (globalThis as any).privateEnv = {
      CORS_ENABLED: true,
      CORS_ALLOWED_ORIGINS: ["http://localhost:5173"],
      CORS_ALLOWED_METHODS: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      CORS_ALLOWED_HEADERS: ["Content-Type", "Authorization"],
      CORS_MAX_AGE: 86400,
      CORS_ALLOW_CREDENTIALS: false,
    };
  });

  it("returns 204 with CORS + security headers for an allowed origin", async () => {
    const event = createPreflightEvent("/api/collections", "http://localhost:5173");
    const response = await handleTurboPipeline({ event, resolve: vi.fn() });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("OPTIONS");
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
    // Security headers are part of the canonical preflight response.
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("X-Request-ID")).toBeTruthy();
  });

  it("rejects disallowed origins with 403", async () => {
    const event = createPreflightEvent("/api/collections", "https://evil.example.com");
    const response = await handleTurboPipeline({ event, resolve: vi.fn() });

    expect(response.status).toBe(403);
  });

  it("lets non-API OPTIONS requests fall through to resolve", async () => {
    const event = createPreflightEvent("/dashboard", "http://localhost:5173");
    const resolve = vi.fn(() => Promise.resolve(new Response("ok", { status: 200 })));
    const response = await handleTurboPipeline({ event, resolve });

    expect(resolve).toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
  });
});
