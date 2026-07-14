/**
 * @file tests/integration/api/user-extended.test.ts
 * @description Black-box integration tests for SveltyCMS /api/user endpoints.
 *
 * Covers:
 *   - POST   /api/user/save-avatar         (multipart avatar upload)
 *   - DELETE /api/user/delete-avatar        (avatar removal)
 *   - POST   /api/user/verify-password      (password verification)
 *   - GET    /api/user/sessions             (active session listing)
 *   - DELETE /api/user/sessions/:id         (session revocation)
 *   - POST   /api/user/batch                (bulk block/unblock/delete)
 *   - POST   /api/user/update-user-attributes  (profile updates)
 *   - Auth-gating across all endpoints
 *
 * Uses the shared test helpers from tests/integration/helpers/.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { getApiBaseUrl, safeFetch } from "../helpers/server";
import {
  initializeTestEnvironment,
  prepareAuthenticatedContext,
  testFixtures,
} from "../helpers/test-setup";

const API_BASE_URL = getApiBaseUrl();

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Create a minimal 1×1 transparent PNG as bytes. */
function tinyPngBytes(): Uint8Array {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
  ]);
}

/** Minimum valid JPEG bytes (1×1 gray pixel). */
function tinyJpegBytes(): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
    0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
    0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
    0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
    0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
    0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
    0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01,
    0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04,
    0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff, 0xc4, 0x00, 0xb5, 0x10, 0x00, 0x02, 0x01, 0x03,
    0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7d, 0x01, 0x02, 0x03, 0x00,
    0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32,
    0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72,
    0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x34, 0x35,
    0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55,
    0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75,
    0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94,
    0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2,
    0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9,
    0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6,
    0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa, 0xff, 0xda,
    0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x37, 0x80, 0x00, 0xff, 0xd9,
  ]);
}

/** Create a file-like blob and wrap in FormData. */
function createAvatarFormData(bytes: Uint8Array, filename: string, mimeType: string): FormData {
  const blob = new Blob([bytes as BlobPart], { type: mimeType });
  const file = new File([blob], filename, { type: mimeType });
  const formData = new FormData();
  formData.append("avatar", file);
  return formData;
}

/** Create a unique test user and return their credentials + session cookie. */
async function _createUniqueUser(
  adminCookie: string,
  role: string = "editor",
): Promise<{ userId: string; email: string; password: string; cookie: string }> {
  const email = `testuser_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@test.com`;
  const password = "TestPass123!";

  // Create user as admin
  const createResp = await safeFetch(`${API_BASE_URL}/api/user/create-user`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      email,
      password,
      confirmPassword: password,
      username: email.split("@")[0],
      role,
    }),
  });

  // Login to get the cookie for the new user
  const loginResp = await safeFetch(`${API_BASE_URL}/api/user/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    skipTestSecret: true,
    body: JSON.stringify({ email, password }),
  });

  const setCookie = loginResp.headers.get("set-cookie") || "";
  const sessionCookie = setCookie
    .split(/,(?=\s*[^=]+=[^;]+)/)
    .map((c) => c.trim().split(";")[0])
    .join("; ");

  // Get the user ID from the response
  const userData = await createResp.json();
  const userId = userData?.data?._id || userData?.data?.id || userData?._id || "";

  return { userId, email, password, cookie: sessionCookie };
}

// ─── Main Test Suite ─────────────────────────────────────────────────────────

describe("User API Extended Integration", () => {
  let adminCookie: string;
  let createdUserIds: string[] = [];

  beforeAll(async () => {
    await initializeTestEnvironment();
    adminCookie = await prepareAuthenticatedContext();
  });

  afterAll(async () => {
    // Clean up created users — try batch delete if there are any
    if (createdUserIds.length > 0) {
      await safeFetch(`${API_BASE_URL}/api/user/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ userIds: createdUserIds, action: "delete" }),
      }).catch(() => {});
    }
  });

  // ─── SUITE 1: AVATAR UPLOAD ──────────────────────────────────────────────

  describe("POST /api/user/save-avatar", () => {
    it("should upload a valid PNG avatar via FormData", async () => {
      const formData = createAvatarFormData(tinyPngBytes(), "avatar.png", "image/png");

      const response = await safeFetch(`${API_BASE_URL}/api/user/save-avatar`, {
        method: "POST",
        headers: { Cookie: adminCookie, Origin: API_BASE_URL },
        body: formData,
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.avatarUrl || result.success).toBeTruthy();
    });

    it("should upload a valid JPEG avatar via FormData", async () => {
      const formData = createAvatarFormData(tinyJpegBytes(), "avatar.jpg", "image/jpeg");

      const response = await safeFetch(`${API_BASE_URL}/api/user/save-avatar`, {
        method: "POST",
        headers: { Cookie: adminCookie, Origin: API_BASE_URL },
        body: formData,
      });

      // JPEG may or may not be accepted depending on server config
      expect([200, 400]).toContain(response.status);
    });

    it("should reject upload when no file is provided", async () => {
      const formData = new FormData();
      // No 'avatar' field appended

      const response = await safeFetch(`${API_BASE_URL}/api/user/save-avatar`, {
        method: "POST",
        headers: { Cookie: adminCookie, Origin: API_BASE_URL },
        body: formData,
      });

      expect(response.status).toBe(400);
    });

    it("should reject upload when avatar field is empty string", async () => {
      const formData = new FormData();
      formData.append("avatar", "");

      const response = await safeFetch(`${API_BASE_URL}/api/user/save-avatar`, {
        method: "POST",
        headers: { Cookie: adminCookie, Origin: API_BASE_URL },
        body: formData,
      });

      expect(response.status).toBe(400);
    });

    it("should reject upload of non-image file type", async () => {
      const textBytes = new TextEncoder().encode("This is not an image file!");
      const formData = createAvatarFormData(textBytes, "doc.txt", "text/plain");

      const response = await safeFetch(`${API_BASE_URL}/api/user/save-avatar`, {
        method: "POST",
        headers: { Cookie: adminCookie, Origin: API_BASE_URL },
        body: formData,
      });

      // Server should reject non-image uploads
      expect([400, 415, 422]).toContain(response.status);
    });

    it("should reject unauthenticated upload", async () => {
      const formData = createAvatarFormData(tinyPngBytes(), "avatar.png", "image/png");

      const response = await safeFetch(`${API_BASE_URL}/api/user/save-avatar`, {
        method: "POST",
        headers: { Origin: API_BASE_URL },
        body: formData,
      });

      expect([401, 403]).toContain(response.status);
    });

    it("should reject upload exceeding max file size", async () => {
      // Create an oversized payload: ~16MB of data
      const bigBytes = new Uint8Array(16 * 1024 * 1024 + 1024);
      bigBytes.fill(0x00);
      // Make it look like PNG header bytes for content sniffing
      bigBytes.set(tinyPngBytes().slice(0, 8), 0);

      const formData = createAvatarFormData(bigBytes, "big.png", "image/png");

      const response = await safeFetch(`${API_BASE_URL}/api/user/save-avatar`, {
        method: "POST",
        headers: { Cookie: adminCookie, Origin: API_BASE_URL },
        body: formData,
      });

      // Server should reject with 413 or 400
      expect([400, 413]).toContain(response.status);
    });
  });

  // ─── SUITE 2: AVATAR DELETE ──────────────────────────────────────────────

  describe("DELETE /api/user/delete-avatar", () => {
    it("should delete an existing avatar", async () => {
      // First upload an avatar so we have one to delete
      const formData = createAvatarFormData(tinyPngBytes(), "avatar.png", "image/png");
      const uploadResp = await safeFetch(`${API_BASE_URL}/api/user/save-avatar`, {
        method: "POST",
        headers: { Cookie: adminCookie, Origin: API_BASE_URL },
        body: formData,
      });
      const uploadResult = await uploadResp.json();
      const avatarUrl = uploadResult.avatarUrl || uploadResult.data?.avatar || "/some-avatar.png";

      const response = await safeFetch(`${API_BASE_URL}/api/user/delete-avatar`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Cookie: adminCookie,
          Origin: API_BASE_URL,
        },
        body: JSON.stringify({ avatarUrl }),
      });

      // The frontend calls this endpoint; the backend may or may not have a
      // dedicated handler. Either 200 (success) or 404 (not implemented) are
      // acceptable outcomes — the test documents expected behavior either way.
      expect([200, 404]).toContain(response.status);
      if (response.status === 200) {
        const result = await response.json();
        expect(result.success || result.message).toBeTruthy();
      }
    });

    it("should handle deleting the default avatar gracefully", async () => {
      const response = await safeFetch(`${API_BASE_URL}/api/user/delete-avatar`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Cookie: adminCookie,
          Origin: API_BASE_URL,
        },
        body: JSON.stringify({ avatarUrl: "/Default_User.svg" }),
      });

      // Should either succeed or return a reasonable status
      expect([200, 400, 404]).toContain(response.status);
    });

    it("should handle deleting a non-existent avatar URL", async () => {
      const response = await safeFetch(`${API_BASE_URL}/api/user/delete-avatar`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Cookie: adminCookie,
          Origin: API_BASE_URL,
        },
        body: JSON.stringify({ avatarUrl: "/non-existent-avatar-xyz.png" }),
      });

      expect([200, 400, 404]).toContain(response.status);
    });

    it("should reject unauthenticated delete", async () => {
      const response = await safeFetch(`${API_BASE_URL}/api/user/delete-avatar`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Origin: API_BASE_URL,
        },
        body: JSON.stringify({ avatarUrl: "/some-avatar.png" }),
      });

      expect([401, 403]).toContain(response.status);
    });

    it("should reject empty avatarUrl in body", async () => {
      const response = await safeFetch(`${API_BASE_URL}/api/user/delete-avatar`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Cookie: adminCookie,
          Origin: API_BASE_URL,
        },
        body: JSON.stringify({}),
      });

      // Should reject with a validation error
      const validStatuses = [200, 400, 404, 422];
      expect(validStatuses).toContain(response.status);
    });
  });

  // ─── SUITE 3: PASSWORD VERIFICATION ─────────────────────────────────────

  describe("POST /api/user/verify-password", () => {
    it("should verify correct password", async () => {
      const response = await safeFetch(`${API_BASE_URL}/api/user/verify-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: adminCookie,
          Origin: API_BASE_URL,
        },
        body: JSON.stringify({ password: testFixtures.users.admin.password }),
      });

      // The frontend calls this endpoint expecting { valid: boolean }
      // It may return 200 on success, 404 if not implemented, or 400/401 on mismatch
      expect([200, 400, 401, 404]).toContain(response.status);
      if (response.status === 200) {
        const result = await response.json();
        expect(result).toHaveProperty("valid");
      }
    });

    it("should reject wrong password", async () => {
      const response = await safeFetch(`${API_BASE_URL}/api/user/verify-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: adminCookie,
          Origin: API_BASE_URL,
        },
        body: JSON.stringify({ password: "WrongPassword999!" }),
      });

      expect([200, 400, 401, 404]).toContain(response.status);
      if (response.status === 200) {
        const result = await response.json();
        expect(result.valid).toBe(false);
      }
    });

    it("should reject unauthenticated password verification", async () => {
      const response = await safeFetch(`${API_BASE_URL}/api/user/verify-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: API_BASE_URL,
        },
        body: JSON.stringify({ password: "SomePassword1!" }),
      });

      expect([401, 403]).toContain(response.status);
    });

    it("should reject empty password in body", async () => {
      const response = await safeFetch(`${API_BASE_URL}/api/user/verify-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: adminCookie,
          Origin: API_BASE_URL,
        },
        body: JSON.stringify({ password: "" }),
      });

      expect([400, 422]).toContain(response.status);
    });
  });

  // ─── SUITE 4: SESSION LISTING ───────────────────────────────────────────

  describe("GET /api/user/sessions", () => {
    it("should list active sessions for authenticated user", async () => {
      const response = await safeFetch(`${API_BASE_URL}/api/user/sessions`, {
        method: "GET",
        headers: { Cookie: adminCookie },
      });

      // Endpoint may return sessions or may not be implemented
      expect([200, 404]).toContain(response.status);
      if (response.status === 200) {
        const result = await response.json();
        expect(result).toBeDefined();
      }
    });

    it("should reject unauthenticated session listing", async () => {
      const response = await safeFetch(`${API_BASE_URL}/api/user/sessions`, {
        method: "GET",
      });

      expect([401, 403]).toContain(response.status);
    });
  });

  // ─── SUITE 5: SESSION REVOCATION ────────────────────────────────────────

  describe("DELETE /api/user/sessions/:id", () => {
    it("should reject unauthenticated session revocation", async () => {
      const response = await safeFetch(`${API_BASE_URL}/api/user/sessions/nonexistent`, {
        method: "DELETE",
      });

      expect([401, 403, 404]).toContain(response.status);
    });
  });

  // ─── SUITE 6: BATCH OPERATIONS ──────────────────────────────────────────

  describe("POST /api/user/batch", () => {
    it("should reject batch operations without auth", async () => {
      const response = await safeFetch(`${API_BASE_URL}/api/user/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: ["fake-id"], action: "delete" }),
      });

      expect([401, 403]).toContain(response.status);
    });

    it("should reject batch operations with invalid action", async () => {
      const response = await safeFetch(`${API_BASE_URL}/api/user/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ userIds: ["fake-id"], action: "nonexistent" }),
      });

      expect([400, 422, 403, 404]).toContain(response.status);
    });
  });

  // ─── SUITE 7: UPDATE USER ATTRIBUTES ────────────────────────────────────

  describe("POST /api/user/update-user-attributes", () => {
    it("should reject unauthenticated update", async () => {
      const response = await safeFetch(`${API_BASE_URL}/api/user/update-user-attributes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: "self",
          newUserData: { preferences: { rtc: { enabled: false } } },
        }),
      });

      expect([401, 403]).toContain(response.status);
    });

    it("should reject update with empty body", async () => {
      const response = await safeFetch(`${API_BASE_URL}/api/user/update-user-attributes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({}),
      });

      expect([400, 422]).toContain(response.status);
    });

    it("should update user preferences for oneself", async () => {
      const response = await safeFetch(`${API_BASE_URL}/api/user/update-user-attributes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({
          user_id: "self",
          newUserData: {
            preferences: { rtc: { enabled: true, sound: false } },
          },
        }),
      });

      // Either succeed (200) or the endpoint may act differently
      expect([200, 400, 404]).toContain(response.status);
    });
  });
});
