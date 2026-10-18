/**
 * @file src/routes/api/[...path]/handlers/system/system-version.ts
 * @description Version-status and update-check routes.
 */

import { logger } from "@src/utils/logger";
import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";
import { successResponse } from "../base";
import { checkForUpdates, readLocalVersion } from "@services/core/version-service";

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
      return successResponse(event, await checkForUpdates());
    }

    // GET /api/system/version (bare — return current version only)
    if (!subAction && request.method === "GET") {
      const currentVersion = readLocalVersion();
      return successResponse(event, { currentVersion });
    }

    throw new AppError(
      `Version endpoint /api/system/version/${subAction || ""} not implemented`,
      404,
    );
  } catch (err: any) {
    logger.error(`[VersionRoute Error] ${segments.join("/")}:`, err);
    if (err instanceof AppError) throw err;
    throw new AppError(err.message || "Version operation failed", 500);
  }
}
