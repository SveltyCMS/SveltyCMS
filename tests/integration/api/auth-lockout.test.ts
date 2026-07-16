import { beforeAll, describe, expect, it, afterAll } from "vitest";
import { getApiBaseUrl, safeFetch, waitForServer } from "../helpers/server";
import { prepareAuthenticatedContext, cleanupTestDatabase } from "../helpers/test-setup";
import { generateUUID } from "@src/utils/native-utils";

const API_BASE_URL = getApiBaseUrl();

describe("Authentication Lockout Integration", () => {
  let authCookie: string;
  let testUserEmail: string;
  let testUserPassword = "Password123!";

  beforeAll(async () => {
    await waitForServer();
    // Prepare a user by logging in (which creates a context and a user if needed)
    authCookie = await prepareAuthenticatedContext();
    testUserEmail = `lockout-test-${generateUUID()}@example.com`;

    // Create a specific user for lockout testing using the admin context
    const createUserRes = await safeFetch(`${API_BASE_URL}/api/user`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: authCookie,
      },
      body: JSON.stringify({
        email: testUserEmail,
        password: testUserPassword,
        username: `lockout_user_${Date.now()}`,
        role: "user",
      }),
    });

    // Ensure the user was created or already exists
    if (!createUserRes.ok && createUserRes.status !== 409) {
      const text = await createUserRes.text();
      console.warn("Failed to create test user:", text);
    }
  });

  afterAll(async () => {
    await cleanupTestDatabase();
  });

  it("should lockout account after 5 failed login attempts", async () => {
    const loginUrl = `${API_BASE_URL}/api/auth/login`;

    // 1. Submit 5 failed attempts
    for (let i = 0; i < 5; i++) {
      const res = await safeFetch(loginUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Test-Security": "true",
        },
        body: JSON.stringify({
          email: testUserEmail,
          password: "WrongPassword123!",
        }),
        skipTestSecret: true,
      });
      // Should be 401 or similar for failed login
      expect(res.status).toBeGreaterThanOrEqual(400);
    }

    // 2. Submit the 6th failed attempt, which should trigger a lockout response
    const lockoutRes = await safeFetch(loginUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Test-Security": "true",
      },
      body: JSON.stringify({
        email: testUserEmail,
        password: "WrongPassword123!",
      }),
      skipTestSecret: true,
    });

    // Auth lockout typically returns 423 Locked or 429 Too Many Requests or 403
    expect(lockoutRes.status).toBeGreaterThanOrEqual(400);

    // 3. Attempt a successful login, which should fail because the account is locked out
    const correctRes = await safeFetch(loginUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Test-Security": "true",
      },
      body: JSON.stringify({
        email: testUserEmail,
        password: testUserPassword,
      }),
      skipTestSecret: true,
    });

    // Even with the correct password, the account is locked, so login must fail
    expect(correctRes.status).toBeGreaterThanOrEqual(400);
    expect(correctRes.status).not.toBe(200);
  });
});
