/**
 * @file src/routes/api/[...path]/handlers/version.ts
 * @description Version handler — update checking against GitHub Releases.
 *
 * Endpoints:
 * - GET /api/system/version/check — check for newer releases on GitHub
 *
 * Features:
 * - Update checking via GitHub Releases API with graceful degradation
 * - Current version reporting
 */

import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";
import { versionService } from "@services/core/version-service";
import { successResponse } from "./base";
import { AppError } from "@utils/error-handling";

/**
 * Dispatches version-related requests.
 * Path: /api/system/version/check
 */
export async function handleVersionRoutes(
  event: RequestEvent,
  _cms: LocalCMS,
  _tenantId: DatabaseId,
  segments: string[],
): Promise<Response> {
  const { request } = event;
  const subAction = segments[1]; // check

  try {
    // GET /api/system/version/check
    if (subAction === "check" && request.method === "GET") {
      return successResponse(event, await versionService.checkForUpdates());
    }

    // GET /api/system/version (bare — return current version only)
    if (!subAction && request.method === "GET") {
      const currentVersion = versionService.readLocalVersion();
      return successResponse(event, { currentVersion });
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
