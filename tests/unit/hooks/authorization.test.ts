/**
 * @file tests/unit/hooks/authorization.test.ts
 * @description Unit tests for handleAuthorization middleware.
 */

import { describe, it, expect, vi } from "vitest";
import { handleAuthorization } from "@src/hooks/handle-authorization";
import type { RequestEvent } from "@sveltejs/kit";

// Mock dependencies
vi.mock("@src/databases/db", () => ({
  dbAdapter: {
    auth: { validateSession: vi.fn() },
  },
  getDbInitPromise: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("$app/environment", () => ({
  browser: false,
  dev: true,
}));

vi.mock("@src/services/settings-service", () => ({
  getPrivateSettingSync: vi.fn().mockReturnValue(false),
}));

describe("Authorization Hook Unit Tests", () => {
  const createMockEvent = (path: string, user: any = null) => {
    return {
      url: new URL(`http://localhost${path}`),
      request: {
        method: "GET",
        headers: new Map(),
      },
      locals: {
        user,
        cms: {
          context: { isLocal: false },
        },
      },
      cookies: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
    } as unknown as RequestEvent;
  };

  it("should allow public routes without authentication", async () => {
    const event = createMockEvent("/login");
    const resolve = vi.fn().mockResolvedValue(new Response("ok"));

    const response = await handleAuthorization({ event, resolve } as any);
    expect(resolve).toHaveBeenCalled();
    const text = await response.text();
    expect(text).toBe("ok");
  });
});
