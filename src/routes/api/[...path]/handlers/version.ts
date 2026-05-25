/**
 * @file src/routes/api/[...path]/handlers/version.ts
 * @description
 * Version channel handlers for the unified API dispatcher.
 *
 * Endpoints:
 * - GET /api/system/version/channels — list available release channels
 * - GET /api/system/version/check   — check for updates in the active channel
 *
 * ### Features:
 * - channel enumeration with human-readable labels
 * - update checking via GitHub Releases API
 * - graceful degradation when remote is unreachable
 */

import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";
import { versionService } from "@services/core/version-service";
import { successResponse } from "./base";
import { AppError } from "@utils/error-handling";

/**
 * Dispatches version-related sub-namespace requests.
 *
 * Path patterns:
 * - /api/system/version/channels  → list channels
 * - /api/system/version/check     → check for updates
 */
export async function handleVersionRoutes(
  event: RequestEvent,
  _cms: LocalCMS,
  _tenantId: DatabaseId,
  segments: string[],
): Promise<Response> {
  const { request } = event;
  const subAction = segments[1]; // channels | check

  // ─── GET /api/version/channels ─────────────────────────────────
  if (subAction === "channels" && request.method === "GET") {
    const channels = versionService.getAvailableChannels();
    const currentChannel = versionService.getCurrentChannel();
    const currentVersion = versionService.readLocalVersion();

    return successResponse(event, {
      channels,
      current: {
        channel: currentChannel,
        version: currentVersion,
      },
    });
  }

  // ─── GET /api/version/check ────────────────────────────────────
  if (subAction === "check" && request.method === "GET") {
    const result = await versionService.checkForUpdates();
    return successResponse(event, result);
  }

  throw new AppError(
    `Version endpoint /api/system/version/${subAction || ""} not implemented`,
    404,
  );
}
