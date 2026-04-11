/**
 * @file src/routes/api/get-tokens-provided/+server.ts
 * @description API endpoint for checking the availability of external service tokens with tenant isolation.
 */

import { getPrivateSettingSync } from "@src/services/settings-service";
import { json } from "@sveltejs/kit";
import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger.server";

interface TokenStatus {
  google: boolean;
  tiktok: boolean;
  twitch: boolean;
}

// GET /api/get-tokens-provided - Returns which API tokens are currently configured (tenant-scoped)
export const GET = apiHandler(async ({ locals }) => {
  const { user, tenantId } = locals;

  if (!user) {
    throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
  }

  if (getPrivateSettingSync("MULTI_TENANT") && !tenantId) {
    throw new AppError("Tenant ID required", 400, "TENANT_REQUIRED");
  }

  logger.debug(`Checking provided tokens for tenant: ${tenantId || "global"}...`);

  const tokensProvided: TokenStatus = {
    google: Boolean(getPrivateSettingSync("GOOGLE_API_KEY", tenantId!)),
    twitch: Boolean(getPrivateSettingSync("TWITCH_TOKEN", tenantId!)),
    tiktok: Boolean(getPrivateSettingSync("TIKTOK_TOKEN", tenantId!)),
  };

  logger.info(`Tokens provided status for tenant ${tenantId || "global"}`, tokensProvided);

  return json(tokensProvided);
});
