/**
 * @file src/routes/api/security/unblock/+server.ts
 * @description
 * API endpoint for manually unblocking an IP address from the security blacklist.
 *
 * Features:
 * - Admin-only endpoint
 * - IP unblocking
 * - Tenant context
 * - Error handling
 * - Logging
 * - Validation
 */

import { hasApiPermission } from "@src/databases/auth/api-permissions";
import { securityResponseService } from "@src/services/security-response-service";
import { json } from "@sveltejs/kit";
// Unified Error Handling
import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger.server";
import { requireTenantContext } from "@utils/tenant-utils";
import { ip, object, parse, pipe, string } from "valibot";

// Request body schema with IPv4 and IPv6 support using Valibot 1.3.0 pipe syntax
const unblockSchema = object({
  ip: pipe(string(), ip("Invalid IP address format")),
});

/**
 * POST /api/security/unblock
 * Manually unblock an IP address from the security blacklist.
 */
export const POST = apiHandler(async ({ locals, request }) => {
  // Authorization check - admin only
  if (!(locals.user && hasApiPermission(locals.user.role, "security"))) {
    throw new AppError("Unauthorized - Admin access required", 403, "FORBIDDEN");
  }

  // Resolve tenantId using shared utility
  const tenantId = requireTenantContext(locals, "IP unblocking");

  const body = await request.json().catch(() => {
    throw new AppError("Invalid JSON", 400, "INVALID_JSON");
  });

  // Validate IP address (supports IPv4 and IPv6)
  const validatedBody = parse(unblockSchema, body);
  const targetIp = validatedBody.ip;

  // Attempt to unblock the IP
  const success = securityResponseService.unblockIP(targetIp);

  if (!success) {
    throw new AppError(
      `IP address ${targetIp} not found in blocked list or already unblocked`,
      404,
      "IP_NOT_FOUND",
    );
  }

  logger.info("IP address manually unblocked", {
    ip: targetIp,
    tenantId,
    unblockedBy: locals.user._id,
    timestamp: Date.now(),
  });

  return json({
    success: true,
    message: `IP address ${targetIp} has been unblocked successfully`,
  });
});
