/**
 * @file src/routes/(app)/config/extensions/plugins-api.ts
 * @description Browser API for plugin enable/disable (Testing 2026).
 */

import { fetchApi, type ApiResponse } from "@utils/api";

export async function togglePlugin(
  pluginId: string,
  enabled: boolean,
): Promise<ApiResponse<{ success?: boolean; message?: string }>> {
  return fetchApi("/api/plugins/toggle", {
    method: "POST",
    body: JSON.stringify({ pluginId, enabled }),
  });
}
