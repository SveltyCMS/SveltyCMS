/**
 * @file src/routes/(app)/config/appearance/appearance-api.ts
 * @description Browser API client for admin themes + user prefs (Testing 2026).
 *
 * Mutations go through fetchApi (CSRF automatic). List endpoints that return
 * raw arrays use credentials include + safe parse.
 *
 * ### Features:
 * - theme list / create / clone / delete / activate
 * - admin-theme save / reset
 * - import preset
 * - marketplace theme list / install
 * - user preference overrides
 */

import { fetchApi, type ApiResponse } from "@utils/api";
import type { StoredAdminTheme, ThemeSummary } from "@src/services/core/admin-theme-service";
import type { MarketplaceItem } from "@src/services/core/marketplace-service";

export async function listThemes(): Promise<ThemeSummary[]> {
  try {
    const res = await fetch("/api/theme/list", { credentials: "include" });
    if (!res.ok) return [];
    const body = await res.json();
    if (Array.isArray(body)) return body as ThemeSummary[];
    if (body && typeof body === "object" && Array.isArray(body.data)) {
      return body.data as ThemeSummary[];
    }
    return [];
  } catch {
    return [];
  }
}

export async function listMarketplaceThemes(): Promise<{
  items: MarketplaceItem[];
  source: "remote" | "local" | "mixed";
}> {
  try {
    const res = await fetch("/api/marketplace?type=theme", { credentials: "include" });
    if (!res.ok) return { items: [], source: "local" };
    const body = await res.json();
    const data = body?.data ?? body;
    return {
      items: (data?.items ?? []) as MarketplaceItem[],
      source: (data?.source ?? "local") as "remote" | "local" | "mixed",
    };
  } catch {
    return { items: [], source: "local" };
  }
}

export async function installMarketplaceTheme(itemId: string): Promise<ApiResponse<unknown>> {
  return fetchApi("/api/marketplace/install", {
    method: "POST",
    body: JSON.stringify({ itemId }),
  });
}

export async function activateTheme(themeId: string): Promise<ApiResponse<StoredAdminTheme>> {
  return fetchApi<StoredAdminTheme>("/api/theme/activate", {
    method: "POST",
    body: JSON.stringify({ themeId }),
  });
}

export async function createTheme(body: {
  name: string;
  settings: Partial<StoredAdminTheme>;
}): Promise<ApiResponse<StoredAdminTheme>> {
  return fetchApi<StoredAdminTheme>("/api/theme/create", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function cloneTheme(
  sourceId: string,
  name: string,
): Promise<ApiResponse<StoredAdminTheme>> {
  return fetchApi<StoredAdminTheme>("/api/theme/clone", {
    method: "POST",
    body: JSON.stringify({ sourceId, name }),
  });
}

export async function deleteTheme(themeId: string): Promise<ApiResponse<unknown>> {
  return fetchApi("/api/theme/delete", {
    method: "POST",
    body: JSON.stringify({ themeId }),
  });
}

export async function saveAdminTheme(
  payload: Partial<StoredAdminTheme>,
): Promise<ApiResponse<StoredAdminTheme>> {
  return fetchApi<StoredAdminTheme>("/api/theme/admin-theme", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function resetAdminTheme(): Promise<ApiResponse<unknown>> {
  return fetchApi("/api/theme/admin-theme", { method: "DELETE" });
}

export async function importThemePreset(
  presetJson: string,
): Promise<ApiResponse<StoredAdminTheme> & { warnings?: unknown[] }> {
  return fetchApi<StoredAdminTheme>("/api/theme/import-preset", {
    method: "POST",
    body: JSON.stringify({ presetJson }),
  }) as Promise<ApiResponse<StoredAdminTheme> & { warnings?: unknown[] }>;
}

export async function updateUserThemePrefs(
  themePrefs: Record<string, unknown>,
): Promise<ApiResponse<unknown>> {
  return fetchApi("/api/user/update-user-attributes", {
    method: "PUT",
    body: JSON.stringify({
      user_id: "self",
      newUserData: { preferences: { theme: themePrefs } },
    }),
  });
}
