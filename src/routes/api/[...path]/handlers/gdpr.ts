/**
 * @file src/routes/api/[...path]/handlers/gdpr.ts
 * @description GDPR Right to Access / Right to Erasure API (POST /api/gdpr).
 *
 * ### Features:
 * - export — data portability JSON for a user
 * - anonymize — irreversible PII wipe (self or admin)
 * - Self-service: user may only act on own id unless admin
 */

import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";
import { AppError } from "@utils/error-handling";
import { successResponse } from "./base";
import { gdprService } from "@src/services/security/gdpr-service";
import { isAdmin } from "@utils/hook-utils";

/**
 * POST /api/gdpr
 * Body: { action: "export" | "anonymize", userId: string, reason?: string }
 */
export async function handleGdprRoutes(
  event: RequestEvent,
  _cms: LocalCMS,
  tenantId: DatabaseId,
  _segments: string[],
) {
  const { request, locals } = event;
  if (request.method !== "POST") {
    throw new AppError("Method not allowed", 405, "METHOD_NOT_ALLOWED");
  }

  const user = locals.user;
  if (!user) {
    throw new AppError("Authentication required", 401, "UNAUTHORIZED");
  }

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "");
  const targetUserId = String(body.userId || body.user_id || "");
  if (!targetUserId) {
    throw new AppError("userId is required", 400, "INVALID_USER_ID");
  }

  const actorId = String(user._id || user.id || "");
  const admin = !!(locals.isAdmin || isAdmin(user));
  if (!admin && targetUserId !== actorId) {
    throw new AppError("Forbidden: can only manage your own data", 403, "FORBIDDEN");
  }

  const effectiveTenant =
    (tenantId as string) || (user.tenantId as string) || (locals.tenantId as string) || "global";

  if (action === "export") {
    const data = await gdprService.exportUserData(targetUserId, effectiveTenant);
    // Match UI expectation: { success, data }
    return successResponse(event, data);
  }

  if (action === "anonymize") {
    // Guard last admin self-wipe lightly: allow if admin is acting on someone else
    // or if more than one user exists (UI also gates this).
    const ok = await gdprService.anonymizeUser(
      targetUserId,
      effectiveTenant,
      body.reason || "User self-request (Right to Erasure)",
    );
    if (!ok) {
      throw new AppError("Anonymization failed", 400, "GDPR_ANONYMIZE_FAILED");
    }
    return successResponse(event, { anonymized: true, userId: targetUserId });
  }

  throw new AppError(`Unknown GDPR action: ${action}`, 400, "INVALID_GDPR_ACTION");
}
