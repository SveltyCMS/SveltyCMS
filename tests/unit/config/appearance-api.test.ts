/**
 * @file tests/unit/config/appearance-api.test.ts
 * @description Unit tests for appearance/theme browser API client.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  listThemes,
  activateTheme,
  saveAdminTheme,
  updateUserThemePrefs,
  resetAdminTheme,
} from "../../../src/routes/(app)/config/appearance/appearance-api";

vi.mock("@src/stores/global-settings.svelte.ts", () => ({
  publicEnv: { DEFAULT_CONTENT_LANGUAGE: "en" },
}));

describe("appearance-api", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { id: "t1", name: "Default" } }),
    });
    globalThis.fetch = fetchMock as typeof fetch;
    vi.stubGlobal("document", {
      get cookie() {
        return "csrf_token=theme-csrf";
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("listThemes handles raw array body", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [{ id: "a", name: "A", isActive: true }],
    });
    const themes = await listThemes();
    expect(themes).toHaveLength(1);
    expect(themes[0].name).toBe("A");
  });

  it("activateTheme posts with CSRF", async () => {
    await activateTheme("theme-1");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/theme/activate",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-CSRF-Token": "theme-csrf" }),
      }),
    );
  });

  it("saveAdminTheme posts with CSRF", async () => {
    await saveAdminTheme({ density: "cozy" } as any);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/theme/admin-theme",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-CSRF-Token": "theme-csrf" }),
      }),
    );
  });

  it("resetAdminTheme is DELETE with CSRF", async () => {
    await resetAdminTheme();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/theme/admin-theme",
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({ "X-CSRF-Token": "theme-csrf" }),
      }),
    );
  });

  it("updateUserThemePrefs is PUT with CSRF", async () => {
    await updateUserThemePrefs({ density: "compact" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/user/update-user-attributes",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({ "X-CSRF-Token": "theme-csrf" }),
      }),
    );
  });
});
