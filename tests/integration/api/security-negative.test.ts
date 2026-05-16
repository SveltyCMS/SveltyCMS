import { safeFetch } from "../helpers/server";
import { beforeAll, describe, expect, it } from "bun:test";

const BASE_URL = process.env.API_BASE_URL || "http://localhost:4173";

let serverAvailable = false;
let authCookieEditor = "";

beforeAll(async () => {
  try {
    const res = await safeFetch(`${BASE_URL}/api/system/health`, {
      signal: AbortSignal.timeout(5000),
    });
    serverAvailable = res.ok;

    if (serverAvailable) {
      // Create an Editor user for negative testing
      const setupRes = await safeFetch(`${BASE_URL}/api/testing`, {
        method: "POST",
        body: JSON.stringify({
          action: "create-user",
          email: "editor@example.com",
          role: "editor",
          password: "Password123!",
        }),
      });

      if (setupRes.ok) {
        // Login as Editor
        const loginRes = await safeFetch(`${BASE_URL}/api/auth/login`, {
          method: "POST",
          body: JSON.stringify({ email: "editor@example.com", password: "Password123!" }),
        });
        authCookieEditor = loginRes.headers.get("set-cookie") || "";
      }
    }
  } catch {
    serverAvailable = false;
  }
});

describe("Security Negative Scenarios (Black-Box)", () => {
  it("should reject admin endpoint access for editor role (RBAC)", async () => {
    if (!serverAvailable) return;

    // /api/settings/all is usually admin-only
    const res = await safeFetch(`${BASE_URL}/api/settings/all`, {
      headers: {
        Cookie: authCookieEditor,
      },
    });

    expect(res.status).toBe(403);
  });

  it("should block cross-tenant data access (Multi-Tenancy)", async () => {
    if (!serverAvailable) return;

    // Attempt to access a collection in another tenant
    // Even if we are an editor in OUR tenant, we should not see data from another
    const res = await safeFetch(`${BASE_URL}/api/collections/posts?tenantId=other-tenant`, {
      headers: {
        Cookie: authCookieEditor,
      },
    });

    // The dispatcher or the adapter should enforce isolation
    expect(res.status).toBe(403);
  });

  it("should block SQL injection attempt in query params", async () => {
    if (!serverAvailable) return;

    const res = await safeFetch(`${BASE_URL}/api/collections/posts?filter[title]=' OR '1'='1`, {
      headers: {
        Cookie: authCookieEditor,
        "X-Test-Security": "true",
      },
    });

    // Firewall should block this
    expect(res.status).toBe(403);
  });

  it("should block XSS payload in POST data", async () => {
    if (!serverAvailable) return;

    const res = await safeFetch(`${BASE_URL}/api/collections/posts`, {
      method: "POST",
      body: JSON.stringify({
        title: "<script>alert('xss')</script>",
      }),
      headers: {
        "Content-Type": "application/json",
        Cookie: authCookieEditor,
        "X-Test-Security": "true",
      },
    });

    // Firewall should block this
    expect(res.status).toBe(403);
  });
});
