/**
 * @file src/routes/api/security/incidents/[id]/resolve/+server.ts
 * @description
 * API endpoint for resolving a specific security incident.
 *
 * Features:
 * - Admin-only endpoint
 * - Incident resolution
 * - Tenant context
 * - Error handling
 * - Logging
 */

import { hasApiPermission } from "@src/databases/auth/api-permissions";
import { securityResponseService } from "@src/services/security-response-service";
import { json } from "@sveltejs/kit";
// Unified Error Handling
import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger.server";
import { requireTenantContext } from "@utils/tenant-utils";

/**
 * POST /api/security/incidents/[id]/resolve
 * Resolve a specific security incident.
 */
export const POST = apiHandler(async ({ locals, params, request }) => {
  // Authorization check - admin only
  if (!(locals.user && hasApiPermission(locals.user.role, "security"))) {
    throw new AppError("Unauthorized - Admin access required", 403, "FORBIDDEN");
  }

  const incidentId = params.id;
  if (!incidentId) {
    throw new AppError("Incident ID is required", 400, "INCIDENT_ID_REQUIRED");
  }

  // Resolve tenantId using shared utility
  const tenantId = requireTenantContext(locals, "Incident resolution");

  const body = await request.json().catch(() => ({}));
  const notes = body.notes || `Resolved by ${locals.user.email || locals.user._id}`;

  // Resolve the incident
  const success = securityResponseService.resolveIncident(incidentId, notes);

  if (!success) {
    throw new AppError("Incident not found or already resolved", 404, "INCIDENT_NOT_FOUND");
  }

  logger.info("Security incident resolved", {
    incidentId,
    tenantId,
    resolvedBy: locals.user._id,
    notes,
  });

  return json({
    success: true,
    message: "Incident resolved successfully",
  });
});
