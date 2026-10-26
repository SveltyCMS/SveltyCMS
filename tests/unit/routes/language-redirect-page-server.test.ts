/**
 * @file tests/unit/routes/language-redirect-page-server.test.ts
 * @description Redirect contract for language-only URLs (`/en` → first collection).
 *
 * Boundaries mocked: content system, system-ready flag, public settings and the
 * auth guard. The route's own fallback chain and error classification run for real.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@src/content/index.server", () => ({
  contentSystem: {
    initialize: vi.fn(),
    getFirstCollectionRedirectUrl: vi.fn(),
  },
}));

vi.mock("@src/stores/system/state.svelte", () => ({
  isSystemReady: vi.fn(),
}));

vi.mock("@src/services/core/settings-service", () => ({
  getPublicSettingSync: vi.fn(),
}));

vi.mock("@utils/page-guards.server", () => ({
  getAuthenticatedUser: vi.fn(),
}));

import { load } from "../../../src/routes/(app)/[language]/+page.server";
import { contentSystem } from "@src/content/index.server";
import { isSystemReady } from "@src/stores/system/state.svelte";
import { getPublicSettingSync } from "@src/services/core/settings-service";
import { getAuthenticatedUser } from "@utils/page-guards.server";

function makeEvent(language: string): Parameters<typeof load>[0] {
  return {
    params: { language },
    locals: { tenantId: "t1" },
    url: new URL(`http://localhost/${language}`),
  } as unknown as Parameters<typeof load>[0];
}

describe("[language] redirect +page.server", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(getAuthenticatedUser).mockReturnValue({ _id: "u1" } as unknown as ReturnType<
      typeof getAuthenticatedUser
    >);
    vi.mocked(getPublicSettingSync).mockImplementation(((key: string) =>
      key === "AVAILABLE_CONTENT_LANGUAGES"
        ? ["en", "de"]
        : undefined) as unknown as typeof getPublicSettingSync);
    vi.mocked(isSystemReady).mockReturnValue(false);
    vi.mocked(contentSystem.initialize).mockResolvedValue(undefined);
    vi.mocked(contentSystem.getFirstCollectionRedirectUrl).mockResolvedValue("/en/posts");
  });

  it("redirects a supported language to the first collection URL (load-contract)", async () => {
    await expect(load(makeEvent("en"))).rejects.toMatchObject({
      status: 302,
      location: "/en/posts",
    });

    expect(vi.mocked(contentSystem.initialize)).toHaveBeenCalledWith("t1");
    expect(vi.mocked(contentSystem.getFirstCollectionRedirectUrl)).toHaveBeenCalledWith("en", "t1");
  });

  it("skips initialization when the system is already ready (load-contract)", async () => {
    vi.mocked(isSystemReady).mockReturnValue(true);

    await expect(load(makeEvent("de"))).rejects.toMatchObject({
      status: 302,
      location: "/en/posts",
    });

    expect(vi.mocked(contentSystem.initialize)).not.toHaveBeenCalled();
  });

  it("answers 404 for a language that is not enabled (failure-path)", async () => {
    await expect(load(makeEvent("fr"))).rejects.toMatchObject({
      status: 404,
      body: { message: "Not Found" },
    });

    expect(vi.mocked(contentSystem.getFirstCollectionRedirectUrl)).not.toHaveBeenCalled();
  });

  it("falls back to the site root when the content system throws (failure-path)", async () => {
    vi.mocked(contentSystem.getFirstCollectionRedirectUrl).mockRejectedValue(
      new Error("content registry offline"),
    );

    await expect(load(makeEvent("en"))).rejects.toMatchObject({
      status: 302,
      location: "/",
    });
  });

  it("falls back to the collection builder when no collection exists (failure-path)", async () => {
    vi.mocked(contentSystem.getFirstCollectionRedirectUrl).mockResolvedValue(null);

    await expect(load(makeEvent("en"))).rejects.toMatchObject({
      status: 302,
      location: "/config/collectionbuilder",
    });
  });
});
