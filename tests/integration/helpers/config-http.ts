/**
 * @file tests/integration/helpers/config-http.ts
 * @description Shared black-box helpers for config-domain HTTP integration tests.
 * Keeps admin/editor session setup consistent across webhooks, automations, and
 * the multi-endpoint admin surface matrix.
 */

import { expect } from "vitest";
import { getApiBaseUrl, safeFetch } from "./server";
import { testFixtures } from "./test-setup";

export const API_BASE_URL = getApiBaseUrl();

export function unwrapList(body: any): any[] {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.data?.data)) return body.data.data;
  return [];
}

export function unwrapEntity(body: any): any {
  return body?.data?.data ?? body?.data ?? body?.webhook ?? body?.flow ?? body;
}

export async function loginAs(
  email: string,
  password: string,
): Promise<{ cookie: string; status: number }> {
  const res = await safeFetch(`${API_BASE_URL}/api/user/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: API_BASE_URL,
    },
    skipTestSecret: true,
    body: JSON.stringify({ email, password }),
  });
  const setCookie = res.headers.get("set-cookie") || "";
  const cookie = setCookie
    .split(/,(?=\s*[^=]+=[^;]+)/)
    .map((c) => c.trim().split(";")[0])
    .filter(Boolean)
    .join("; ");
  return { cookie, status: res.status };
}

export async function ensureEditorUser(adminCookie: string): Promise<void> {
  await safeFetch(`${API_BASE_URL}/api/user/create-user`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: adminCookie,
      Origin: API_BASE_URL,
    },
    body: JSON.stringify({
      email: testFixtures.editorUser.email,
      password: testFixtures.editorUser.password,
      username: testFixtures.editorUser.username,
      role: "editor",
      confirmPassword: testFixtures.editorUser.password,
    }),
  }).catch(() => undefined);
}

export async function authGet(
  path: string,
  cookie?: string,
  opts?: { skipTestSecret?: boolean },
): Promise<{ status: number; body: any; raw: Response }> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    Origin: API_BASE_URL,
  };
  if (cookie) headers.Cookie = cookie;
  const res = await safeFetch(`${API_BASE_URL}${path}`, {
    headers,
    skipTestSecret: opts?.skipTestSecret ?? !cookie,
  });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body, raw: res };
}

export async function authJson(
  method: string,
  path: string,
  cookie: string | undefined,
  payload?: unknown,
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    Origin: API_BASE_URL,
    "Content-Type": "application/json",
  };
  if (cookie) headers.Cookie = cookie;
  const res = await safeFetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: payload === undefined ? undefined : JSON.stringify(payload),
    skipTestSecret: !cookie,
  });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

/** Expect fail-closed: not 200 when unauthenticated or underprivileged. */
export function expectDenied(status: number, label: string): void {
  expect(status, label).not.toBe(200);
  expect([401, 403], label).toContain(status);
}
