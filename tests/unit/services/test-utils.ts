/**
 * @file tests/unit/services/test-utils.ts
 * @description Shared mock factories for service tests.
 */
import { vi } from "vitest";

export function createMockDb() {
  return {
    crud: {
      findMany: vi.fn(),
      findOne: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    system: { preferences: { get: vi.fn(), set: vi.fn(), getMany: vi.fn() } },
    auth: {
      getUserById: vi.fn(),
      updateUserAttributes: vi.fn(),
      validateSession: vi.fn(),
    },
    collection: {
      getModel: vi.fn(),
      createModel: vi.fn(),
      listSchemas: vi.fn(),
    },
    media: { getByHash: vi.fn(), upload: vi.fn(), delete: vi.fn() },
    isConnected: vi.fn().mockReturnValue(true),
  };
}

export function createMockRequest(
  url: string,
  method = "GET",
  headers: Record<string, string> = {},
) {
  return new Request(url, { method, headers });
}

export const XSS_PAYLOADS = [
  "<script>alert(1)</script>",
  "javascript:alert(1)",
  "<img src=x onerror=alert(1)>",
  "<svg onload=alert(1)>",
  "'; DROP TABLE users;--",
  "../../../etc/passwd",
  "<iframe src='evil.com'>",
  "<body onload=alert(1)>",
];
