/**
 * @file src/routes/api/[...path]/handlers/version.ts
 * @description Version channel handlers — release channel enumeration and update checking.
 *
 * Endpoints:
 * - GET /api/system/version/channels — list available release channels
 * - GET /api/system/version/check   — check for updates in the active channel
 *
 * Features:
 * - Channel enumeration with human-readable labels
 * - Update checking via GitHub Releases API with graceful degradation
 * - Current channel and version reporting
 */

import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";
import { versionService } from "@services/core/version-service";
import { successResponse } from "./base";
import { AppError } from "@utils/error-handling";

/**
 * Dispatches version-related sub-namespace requests.
 * Path: /api/system/version/{channels,check}
 */
export async function handleVersionRoutes(
  event: RequestEvent,
  _cms: LocalCMS,
  _tenantId: DatabaseId,
  segments: string[],
): Promise<Response> {
  const { request } = event;
  const subAction = segments[1]; // channels | check

  try {
    // ── GET /api/system/version/channels ──
    if (subAction === "channels" && request.method === "GET") {
      const channels = versionService.getAvailableChannels();
      const currentChannel = versionService.getCurrentChannel();
      const currentVersion = versionService.readLocalVersion();

      return successResponse(event, {
        channels,
        current: { channel: currentChannel, version: currentVersion },
      });
    }

    // ── GET /api/system/version/check ──
    if (subAction === "check" && request.method === "GET") {
      return successResponse(event, await versionService.checkForUpdates());
    }

    throw new AppError(
      `Version endpoint /api/system/version/${subAction || ""} not implemented`,
      404,
    );
  } catch (err: any) {
    console.error(`[VersionRoute Error] ${segments.join("/")}:`, err);
    if (err instanceof AppError) throw err;
    throw new AppError(err.message || "Version operation failed", 500);
  }
}
