/**
 * @file tests/integration/api/mail.test.ts
 * @description Integration tests for Email API endpoints
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getApiBaseUrl, safeFetch, waitForServer } from "../helpers/server";
import { cleanupTestDatabase, prepareAuthenticatedContext } from "../helpers/test-setup";

const BASE_URL = getApiBaseUrl();
let authCookie: string;

beforeAll(async () => {
  await waitForServer();
  authCookie = await prepareAuthenticatedContext();
});

afterAll(async () => {
  await cleanupTestDatabase();
});

describe("Email API - Send Mail", () => {
  it("should reject email when not configured", async () => {
    const response = await safeFetch(`${BASE_URL}/api/send-mail`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: authCookie,
        Origin: BASE_URL,
      },
      body: JSON.stringify({
        to: "test@example.com",
        subject: "Test Email",
        body: "Test email body",
      }),
    });

    expect(response.status).toBe(400);
  });

  it("should validate email parameters", async () => {
    const response = await safeFetch(`${BASE_URL}/api/send-mail`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: authCookie,
        Origin: BASE_URL,
      },
      body: JSON.stringify({
        subject: "Test",
        // Missing to and body
      }),
    });

    expect(response.status).toBe(400);
  });

  it("should validate email addresses", async () => {
    const response = await safeFetch(`${BASE_URL}/api/send-mail`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: authCookie,
        Origin: BASE_URL,
      },
      body: JSON.stringify({
        to: "invalid-email",
        subject: "Test",
        body: "Test",
      }),
    });

    expect(response.status).toBe(400);
  });

  it("should require authentication", async () => {
    const response = await safeFetch(`${BASE_URL}/api/send-mail`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: BASE_URL },
      body: JSON.stringify({
        to: "test@example.com",
        subject: "Test",
        body: "Test",
      }),
    });

    expect(response.status).toBe(401);
  });

  it("should reject HTML email when not configured", async () => {
    const response = await safeFetch(`${BASE_URL}/api/send-mail`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: authCookie,
        Origin: BASE_URL,
      },
      body: JSON.stringify({
        to: "test@example.com",
        subject: "HTML Test",
        body: "<h1>Test</h1>",
        html: true,
      }),
    });

    expect(response.status).toBe(400);
  });
});
