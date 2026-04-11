/**
 * @file src/routes/api/gdpr/+server.ts
 * @description API endpoint for GDPR operations.
 *
 * Features:
 * - Export user data
 * - Anonymize user data
 *
 */

import { gdprService } from "@src/services/gdpr-service";
import { json } from "@sveltejs/kit";
import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger.server";
import { getPrivateSettingSync } from "@src/services/settings-service";

export const POST = apiHandler(async ({ request, locals }) => {
  // 1. Security Check
  const { user, tenantId, isAdmin } = locals;
  if (!user) {
    throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
  }

  if (getPrivateSettingSync("MULTI_TENANT") && !tenantId) {
    throw new AppError("Tenant ID required", 400, "TENANT_REQUIRED");
  }

  try {
    const { action, userId, reason } = await request.json();

    if (!userId) {
      throw new AppError("User ID is required", 400, "MISSING_USER_ID");
    }

    // 2. Authorization Check: Only admins or the user themselves can perform these actions
    const isSelf = user._id.toString() === userId.toString();
    if (!(isAdmin || isSelf)) {
      logger.warn(`Unauthorized GDPR action attempt by user ${user._id} on user ${userId}`);
      throw new AppError(
        "Forbidden: You can only perform this action on your own data or as an administrator.",
        403,
        "FORBIDDEN",
      );
    }

    // 3. Service Calls with tenant isolation
    if (action === "export") {
      const data = await gdprService.exportUserData(userId, tenantId!);
      return json({ success: true, data });
    }

    if (action === "anonymize") {
      const success = await gdprService.anonymizeUser(
        userId,
        tenantId!,
        reason || (isSelf ? "User Self-Request" : "Admin Manual Request"),
      );
      if (!success) {
        throw new AppError("Anonymization failed. Check server logs.", 500, "ANONYMIZATION_FAILED");
      }
      return json({ success: true });
    }

    throw new AppError("Invalid action", 400, "INVALID_ACTION");
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error("GDPR API Error:", err);
    throw new AppError("Internal Server Error", 500, "GDPR_ERROR");
  }
});
