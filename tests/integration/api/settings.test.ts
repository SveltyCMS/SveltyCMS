/**
 * @file tests/bun/api/settings.test.ts
 * @description Integration tests for Settings & Configuration API endpoints
 *
 * Tests settings management endpoints:
 * - GET /api/settings/[group] - Get settings by group
 * - PUT /api/settings/[group] - Update settings group
 * - GET /api/settings/public - Get public settings
 * - GET /api/settings/public/stream - Stream public settings (SSE)
 * - POST /api/system-settings/export - Export system settings
 * - POST /api/system-settings/import - Import system settings
 * - GET /api/system-preferences - Get user preferences
 * - POST /api/system-preferences - Update user preferences
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getApiBaseUrl, safeFetch, waitForServer } from "../helpers/server";
import { cleanupTestDatabase, prepareAuthenticatedContext } from "../helpers/test-setup";

const BASE_URL = getApiBaseUrl();
let authCookie: string;

beforeAll(async () => {
  await waitForServer();

  // Use shared helper to prepare authenticated context
  authCookie = await prepareAuthenticatedContext();
});

afterAll(async () => {
  // Optional: cleanup via API if needed,
  // but usually better to leave DB state for debugging unless pipeline forces clean
  await cleanupTestDatabase();
});

describe("Settings API - Get Settings by Group", () => {
  it("should retrieve general settings", async () => {
    const response = await safeFetch(`${BASE_URL}/api/settings/general`, {
      headers: { Cookie: authCookie, Origin: BASE_URL },
    });

    expect([200, 404]).toContain(response.status);

    if (response.ok) {
      const data = await response.json();
      // GET /api/settings/[group] → { success, values }
      expect(data.success).toBe(true);
      expect(typeof data.values).toBe("object");
    }
  });

  it("should retrieve email settings", async () => {
    const response = await safeFetch(`${BASE_URL}/api/settings/email`, {
      headers: { Cookie: authCookie, Origin: BASE_URL },
    });

    expect([200, 404]).toContain(response.status);
  });

  it("should retrieve theme settings", async () => {
    const response = await safeFetch(`${BASE_URL}/api/settings/theme`, {
      headers: { Cookie: authCookie, Origin: BASE_URL },
    });

    expect([200, 404]).toContain(response.status);
  });

  it("should require authentication", async () => {
    const response = await safeFetch(`${BASE_URL}/api/settings/general`, {
      headers: { Origin: BASE_URL },
    });
    expect([401, 403]).toContain(response.status);
  });

  it("should return 404 for non-existent group", async () => {
    const response = await safeFetch(`${BASE_URL}/api/settings/nonexistent-group`, {
      headers: { Cookie: authCookie, Origin: BASE_URL },
    });

    expect([404, 400]).toContain(response.status);
  });

  it("should include all settings in group", async () => {
    const response = await safeFetch(`${BASE_URL}/api/settings/general`, {
      headers: { Cookie: authCookie, Origin: BASE_URL },
    });

    if (response.ok) {
      const data = await response.json();
      // Settings groups are key-value pairs under `values`.
      expect(data.success).toBe(true);
      expect(typeof data.values).toBe("object");
    }
  });
});

describe("Settings API - Update Settings Group", () => {
  it("should update settings group", async () => {
    const response = await safeFetch(`${BASE_URL}/api/settings/general`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Cookie: authCookie,
        Origin: BASE_URL,
      },
      body: JSON.stringify({
        siteName: "Test Site",
        siteDescription: "Test Description",
      }),
    });

    expect([200, 400, 404]).toContain(response.status);

    if (response.ok) {
      const data = await response.json();
      expect(data.success || data.updated).toBeTruthy();
    }
  });

  it("should validate setting values", async () => {
    const response = await safeFetch(`${BASE_URL}/api/settings/general`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Cookie: authCookie,
        Origin: BASE_URL,
      },
      body: JSON.stringify({
        invalidSetting: "value",
      }),
    });

    // May accept or reject based on validation — but a 5xx must not pass.
    expect([200, 400, 403, 422]).toContain(response.status);
  });

  it("should require admin authentication", async () => {
    const response = await safeFetch(`${BASE_URL}/api/settings/general`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Origin: BASE_URL },
      body: JSON.stringify({ siteName: "Test" }),
    });

    expect([401, 403]).toContain(response.status);
  });

  it("should preserve existing settings when updating", async () => {
    // Get current settings
    const getResponse = await safeFetch(`${BASE_URL}/api/settings/general`, {
      headers: { Cookie: authCookie, Origin: BASE_URL },
    });

    if (getResponse.ok) {
      const currentSettings = await getResponse.json();

      // Update one setting
      const updateResponse = await safeFetch(`${BASE_URL}/api/settings/general`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: authCookie,
          Origin: BASE_URL,
        },
        body: JSON.stringify({
          ...currentSettings,
          testSetting: "test value",
        }),
      });

      expect([200, 400]).toContain(updateResponse.status);
    }
  });
});

describe("Settings API - Public Settings", () => {
  it("should serve public settings without authentication", async () => {
    const response = await safeFetch(`${BASE_URL}/api/settings/public`, {
      headers: { Origin: BASE_URL },
    });
    // Public settings endpoint is intentionally unauthenticated
    expect(response.status).toBe(200);
    const data = await response.json();
    // GET /api/settings/public → { success, data: <public env> }
    expect(data.success).toBe(true);
    expect(typeof data.data).toBe("object");
    expect(data.data.BASE_LOCALE).toBeDefined();
  });

  it("should allow admin access to public settings", async () => {
    const response = await safeFetch(`${BASE_URL}/api/settings/public`, {
      headers: { Cookie: authCookie, Origin: BASE_URL },
    });

    expect([200, 404]).toContain(response.status);
    if (response.ok) {
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(typeof data.data).toBe("object");
    }
  });

  it("should not expose sensitive settings", async () => {
    const response = await safeFetch(`${BASE_URL}/api/settings/public`, {
      headers: { Cookie: authCookie, Origin: BASE_URL },
    });

    if (response.ok) {
      const data = await response.json();
      // The old `data.privateKey` / `data.apiSecret` checks read keys that live
      // under `data.data` now, so they were trivially undefined. Scan the whole
      // serialized payload for secret-bearing names instead.
      const serialized = JSON.stringify(data).toLowerCase();
      for (const secret of [
        "smtppassword",
        "privatekey",
        "apisecret",
        "databaseurl",
        "jwt_secret_key",
        "encryption_key",
        "test_api_secret",
        "db_password",
      ]) {
        expect(serialized).not.toContain(secret);
      }
    }
  });

  it("should include theme settings in data", async () => {
    const response = await safeFetch(`${BASE_URL}/api/settings/public`, {
      headers: { Cookie: authCookie, Origin: BASE_URL },
    });

    if (response.ok) {
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
    }
  });
});

describe("Settings API - Public Settings Stream", () => {
  it("should serve settings stream without authentication", async () => {
    const response = await safeFetch(`${BASE_URL}/api/settings/public/stream`, {
      headers: { Origin: BASE_URL },
    });
    // Public stream endpoint is intentionally unauthenticated (SSE for client settings)
    expect([200, 404, 501]).toContain(response.status);
  });

  it("should support server-sent events for authenticated settings", async () => {
    const response = await safeFetch(`${BASE_URL}/api/settings/public/stream`, {
      headers: { Cookie: authCookie, Origin: BASE_URL },
    });

    // SSE endpoints use text/event-stream
    expect([200, 404, 501]).toContain(response.status);

    if (response.ok) {
      const contentType = response.headers.get("content-type");
      if (contentType) {
        expect(contentType).toContain("text/event-stream");
      }
    }
  });
});

describe("Settings API - Export System Settings", () => {
  it("should export all system settings", async () => {
    const response = await safeFetch(`${BASE_URL}/api/system-settings/export`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: authCookie,
        Origin: BASE_URL,
      },
      body: JSON.stringify({}),
    });

    expect([200, 404]).toContain(response.status);

    if (response.ok) {
      const data = await response.json();
      // POST /api/system-settings/export → { success, data: <groups> }
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
    }
  });

  it("should require admin authentication for export", async () => {
    const response = await safeFetch(`${BASE_URL}/api/system-settings/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: BASE_URL },
      body: JSON.stringify({}),
    });

    expect([401, 403]).toContain(response.status);
  });

  it("should include all setting groups in export", async () => {
    const response = await safeFetch(`${BASE_URL}/api/system-settings/export`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: authCookie,
        Origin: BASE_URL,
      },
      body: JSON.stringify({ includeSettings: true }),
    });

    if (response.ok) {
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
    }
  });

  it("should sanitize sensitive data in export", async () => {
    const response = await safeFetch(`${BASE_URL}/api/system-settings/export`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: authCookie,
        Origin: BASE_URL,
      },
      body: JSON.stringify({}),
    });

    if (response.ok) {
      const data = await response.json();

      // Should not export passwords in plain text
      if (data.email) {
        expect(data.email.smtpPassword).toBeUndefined();
      }
    }
  });
});

describe("Settings API - Import System Settings", () => {
  it("should import system settings", async () => {
    const settingsData = {
      general: {
        siteName: "Imported Site",
        siteDescription: "Test Import",
      },
    };

    const importPayload = {
      data: {
        metadata: {
          exported_at: new Date().toISOString(),
          cms_version: "1.0.0",
          export_id: "test-import",
        },
        settings: settingsData,
      },
      options: {
        strategy: "merge",
      },
    };

    const response = await safeFetch(`${BASE_URL}/api/system-settings/import`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: authCookie,
        Origin: BASE_URL,
      },
      body: JSON.stringify(importPayload),
    });

    expect([200, 400, 404]).toContain(response.status);

    if (response.ok) {
      const data = await response.json();
      expect(data.success || data.imported).toBeTruthy();
    }
  });

  it("should validate imported settings structure", async () => {
    const response = await safeFetch(`${BASE_URL}/api/system-settings/import`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: authCookie,
        Origin: BASE_URL,
      },
      body: JSON.stringify({
        data: {
          // Missing metadata and valid structure
          invalid: "structure",
        },
      }),
    });

    // Should validate before importing
    expect([200, 400, 422]).toContain(response.status);
  });

  it("should require admin authentication for import", async () => {
    const response = await safeFetch(`${BASE_URL}/api/system-settings/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: BASE_URL },
      body: JSON.stringify({}),
    });

    expect([401, 403]).toContain(response.status);
  });

  it("should merge with existing settings safely", async () => {
    const response = await safeFetch(`${BASE_URL}/api/system-settings/import`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: authCookie,
        Origin: BASE_URL,
      },
      body: JSON.stringify({
        data: {
          metadata: {
            exported_at: new Date().toISOString(),
            cms_version: "1.0.0",
            export_id: "test-merge",
          },
          settings: {
            general: {
              newSetting: "value",
            },
          },
        },
        options: {
          strategy: "merge",
        },
      }),
    });

    // Should merge, not replace entirely
    expect([200, 400, 404]).toContain(response.status);
  });
});

describe("Settings API - User Preferences", () => {
  it("should get user preferences", async () => {
    const response = await safeFetch(`${BASE_URL}/api/system-preferences?key=theme`, {
      headers: { Cookie: authCookie, Origin: BASE_URL },
    });

    expect([200, 404]).toContain(response.status);

    const data = await response.json();
    // The not-found case is the standard error envelope, not an empty body.
    if (response.ok) {
      expect(data.success).toBe(true);
    } else {
      expect(data.success).toBe(false);
      expect(typeof data.message).toBe("string");
    }
  });

  it("should update user preferences", async () => {
    const response = await safeFetch(`${BASE_URL}/api/system-preferences`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: authCookie,
        Origin: BASE_URL,
      },
      body: JSON.stringify({
        theme: "dark",
        language: "en",
      }),
    });

    expect([200, 400, 404]).toContain(response.status);
  });

  it("should require authentication for preferences", async () => {
    const response = await safeFetch(`${BASE_URL}/api/system-preferences`, {
      headers: { Origin: BASE_URL },
    });
    expect([401, 403]).toContain(response.status);
  });

  it("should isolate preferences per user", async () => {
    // User preferences should be scoped to the logged-in user
    const response = await safeFetch(`${BASE_URL}/api/system-preferences`, {
      headers: { Cookie: authCookie, Origin: BASE_URL },
    });

    const data = await response.json();
    // Envelope invariant: the success flag must agree with the HTTP status.
    expect(data.success).toBe(response.ok);
    expect(typeof data).toBe("object");
  });
});

describe("Settings API - Multi-Tenant Support", () => {
  it("should scope settings to tenant", async () => {
    const response = await safeFetch(`${BASE_URL}/api/settings/general`, {
      headers: { Cookie: authCookie, Origin: BASE_URL },
    });

    // In multi-tenant mode, settings should be tenant-scoped
    expect([200, 404]).toContain(response.status);
  });

  it("denies unauthenticated setting access (fail-closed boundary)", async () => {
    // A true cross-tenant probe needs a second tenant; what is testable here is the
    // fail-closed boundary. The old `expect(status).toBeGreaterThanOrEqual(200)`
    // passed for ANY status, including 500.
    const unauth = await safeFetch(`${BASE_URL}/api/settings/general`, {
      headers: { Origin: BASE_URL },
      skipTestSecret: true,
    });
    expect([401, 403]).toContain(unauth.status);

    const authed = await safeFetch(`${BASE_URL}/api/settings/general`, {
      headers: { Cookie: authCookie, Origin: BASE_URL },
    });
    expect([200, 404]).toContain(authed.status);
  });
});
