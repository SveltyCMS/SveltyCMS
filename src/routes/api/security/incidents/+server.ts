/**
 * @file src/routes/api/security/incidents/+server.ts
 * @description Security incidents management API endpoints
 *
 * ### Features
 * - List active security incidents
 * - Incident resolution and management
 * - Threat level filtering and sorting
 * - Real-time incident updates
 * - Administrative controls
 *
 * @security Admin-only endpoints with comprehensive logging
 */

import { hasApiPermission } from "@src/databases/auth/api-permissions";
import { securityResponseService } from "@src/services/security-response-service";
import type { SecurityIncident } from "@src/services/security-types";
import { json } from "@sveltejs/kit";
// Unified Error Handling
import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger.server";
import { requireTenantContext } from "@utils/tenant-utils";
import {
  any,
  ip,
  literal,
  maxValue,
  minLength,
  minValue,
  number,
  object,
  parse,
  pipe,
  string,
  union,
} from "valibot";

// Schema for manual incident reporting
const createIncidentSchema = object({
  ip: pipe(string(), ip("Invalid IP address format")),
  eventType: union([
    literal("rate_limit"),
    literal("auth_failure"),
    literal("csp_violation"),
    literal("sql_injection"),
    literal("xss_attempt"),
    literal("brute_force"),
    literal("suspicious_ua"),
    literal("ip_reputation"),
    literal("command_injection"),
    literal("ldap_injection"),
    literal("path_traversal"),
    literal("header_anomaly"),
    literal("payload_anomaly"),
  ]),
  severity: pipe(
    number(),
    minValue(1, "Severity must be at least 1"),
    maxValue(10, "Severity cannot exceed 10"),
  ),
  evidence: pipe(string(), minLength(1, "Evidence is required")),
  metadata: any(),
});

/**
 * GET /api/security/incidents
 * Returns list of active security incidents with filtering options.
 */
export const GET = apiHandler(async ({ locals, url }) => {
  // Authorization check - admin only
  if (!(locals.user && hasApiPermission(locals.user.role, "security"))) {
    logger.warn("Unauthorized security incidents access attempt", {
      userId: locals.user?._id,
      role: locals.user?.role,
    });
    throw new AppError("Unauthorized - Admin access required", 403, "FORBIDDEN");
  }

  // Resolve tenantId using shared utility
  const tenantId = requireTenantContext(locals, "Security incidents list");

  // Get query parameters for filtering
  const threatLevel = url.searchParams.get("threatLevel");
  const resolved = url.searchParams.get("resolved");
  const limit = Number.parseInt(url.searchParams.get("limit") || "50", 10);
  const offset = Number.parseInt(url.searchParams.get("offset") || "0", 10);

  // Get incidents from security service
  let incidents = await securityResponseService.getActiveIncidents();

  // Apply filters
  if (threatLevel && threatLevel !== "all") {
    incidents = incidents.filter((inc: SecurityIncident) => inc.threatLevel === threatLevel);
  }

  if (resolved === "true") {
    // Note: getActiveIncidents() only returns unresolved incidents
    incidents = [];
  }

  // Sort by timestamp (newest first)
  incidents.sort((a: SecurityIncident, b: SecurityIncident) => b.timestamp - a.timestamp);

  // Apply pagination
  const paginatedIncidents = incidents.slice(offset, offset + limit);

  const response = {
    incidents: paginatedIncidents,
    pagination: {
      total: incidents.length,
      offset,
      limit,
      hasMore: offset + limit < incidents.length,
    },
    filters: {
      threatLevel,
      resolved,
      availableThreatLevels: ["all", "low", "medium", "high", "critical"],
    },
  };

  logger.debug("Security incidents requested", {
    userId: locals.user._id,
    tenantId,
    resultCount: paginatedIncidents.length,
    filters: { threatLevel, resolved },
  });

  return json(response);
});

/**
 * POST /api/security/incidents
 * Create a new security incident (for manual reporting).
 */
export const POST = apiHandler(async ({ locals, request }) => {
  // Authorization check - admin only
  if (!(locals.user && hasApiPermission(locals.user.role, "security"))) {
    throw new AppError("Unauthorized - Admin access required", 403, "FORBIDDEN");
  }

  // Resolve tenantId using shared utility
  const tenantId = requireTenantContext(locals, "Incident reporting");

  const body = await request.json().catch(() => {
    throw new AppError("Invalid JSON", 400, "INVALID_JSON");
  });

  // Validate request body using Valibot
  const validatedBody = parse(createIncidentSchema, body);
  const { ip, eventType, severity, evidence, metadata } = validatedBody;

  // Report the security event
  securityResponseService.reportSecurityEvent(ip, eventType, severity, evidence, {
    ...metadata,
    reportedBy: locals.user._id,
    tenantId,
    manual: true,
  });

  logger.info("Manual security incident reported", {
    reportedBy: locals.user._id,
    tenantId,
    ip,
    eventType,
    severity,
    evidence: evidence.substring(0, 100),
  });

  return json({
    success: true,
    message: "Security incident reported successfully",
  });
});
