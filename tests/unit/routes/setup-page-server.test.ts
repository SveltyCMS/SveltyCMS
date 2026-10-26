/**
 * @file tests/unit/routes/setup-page-server.test.ts
 * @description Unit tests for the `/setup` page load (`+page.server.ts`).
 *
 * Setup-state detection, the setup service module and the session-cookie helpers
 * are boundaries and are mocked; the route's redirect and load contract run for
 * real. Actions are intentionally out of scope.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getSetupState: vi.fn<() => Promise<string>>(),
  clearAllSessionCookies: vi.fn<(cookies: unknown, path?: string) => void>(),
}));

vi.mock("@utils/server/setup-check", () => ({
  SetupState: {
    MISSING_CONFIG: "MISSING_CONFIG",
    MISSING_ADMIN: "MISSING_ADMIN",
    COMPLETE: "COMPLETE",
  },
  getSetupState: () => h.getSetupState(),
}));

vi.mock("@src/routes/setup/setup.server", () => ({
  testDatabaseConnection: vi.fn(),
  seedDatabase: vi.fn(),
  completeSetup: vi.fn(),
  testEmailConnection: vi.fn(),
  testRedisConnection: vi.fn(),
}));

vi.mock("@src/databases/auth/constants", () => ({
  clearAllSessionCookies: (cookies: unknown, path?: string) =>
    h.clearAllSessionCookies(cookies, path),
}));

import { load } from "../../../src/routes/setup/+page.server";

type SetupLoadEvent = Parameters<typeof load>[0];

function makeLoadEvent(): SetupLoadEvent {
  return {
    locals: { theme: "dark", darkMode: true },
    cookies: {},
  } as unknown as SetupLoadEvent;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getSetupState.mockResolvedValue("MISSING_ADMIN");
});

describe("/setup +page.server load", () => {
  it("redirects to /login when setup is already complete", async () => {
    h.getSetupState.mockResolvedValue("COMPLETE");

    await expect(load(makeLoadEvent())).rejects.toMatchObject({
      status: 302,
      location: "/login",
    });
    expect(h.clearAllSessionCookies).not.toHaveBeenCalled();
  });

  it("returns the setup page contract while setup is incomplete", async () => {
    const data = (await load(makeLoadEvent())) as {
      theme: string;
      darkMode: boolean;
      availableLanguages: string[];
      settings: { PKG_VERSION: string };
    };

    expect(data).toMatchObject({
      theme: "dark",
      darkMode: true,
      settings: { PKG_VERSION: expect.any(String) },
    });
    expect(Array.isArray(data.availableLanguages)).toBe(true);
    expect(data.availableLanguages).toEqual(expect.arrayContaining(["en", "de"]));
    expect(h.clearAllSessionCookies).toHaveBeenCalledWith(expect.anything(), "/");
  });
});
