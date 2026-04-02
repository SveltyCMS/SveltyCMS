/**
 * @file src/routes/api/scim/v2/Groups/+server.ts
 * @description API endpoint for managing groups (roles) via SCIM v2 protocol (RFC 7644)
 *
 * Features:
 * - Bearer Token + Session-based authentication
 * - GET All Groups with SCIM filter support
 * - POST Create Group/Role
 * - SCIM-compliant error responses
 * - Audit logging
 */

import { auth } from "@src/databases/db";
import { json } from "@sveltejs/kit";
import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger.server";
import {
  buildScimGroup,
  buildScimListResponse,
  matchesScimFilter,
  parseScimFilter,
  scimError,
  validateScimAuth,
} from "@utils/scim-utils";

export const GET = apiHandler(async ({ url, locals, request }) => {
  // SCIM auth: Bearer token or admin session
  const authResult = await validateScimAuth(request, locals);
  if (!authResult.authenticated) {
    return scimError(401, authResult.error || "Unauthorized");
  }

  const tenantId = authResult.tenantId;

  if (!auth) {
    throw new AppError("Authentication service not available", 500, "AUTH_UNAVAILABLE");
  }

  // Filter support
  const filterString = url.searchParams.get("filter");
  const filters = parseScimFilter(filterString);

  // Fetch roles scoped to tenant
  const dbRoles = await auth.getAllRoles({ tenantId: tenantId as any });

  // Apply filters (map displayName → name for matching)
  const filteredRoles = dbRoles.filter((r: Record<string, any>) => {
    const mappedRole = { ...r, displayname: r.name, displayName: r.name };
    return matchesScimFilter(mappedRole, filters);
  });

  // Map to SCIM format
  const resources = filteredRoles.map((r: Record<string, any>) => buildScimGroup(r, url.origin));

  return json(buildScimListResponse(resources, resources.length));
});

export const POST = apiHandler(async ({ request, url, locals }) => {
  // SCIM auth: Bearer token or admin session
  const authResult = await validateScimAuth(request, locals);
  if (!authResult.authenticated) {
    return scimError(401, authResult.error || "Unauthorized");
  }

  const tenantId = authResult.tenantId;

  if (!auth) {
    throw new AppError("Authentication service not available", 500, "AUTH_UNAVAILABLE");
  }

  const body = await request.json().catch(() => {
    throw new AppError("Invalid JSON payload", 400, "INVALID_JSON");
  });

  // Validate required fields
  if (!body.displayName) {
    return scimError(400, "displayName is required", "invalidValue");
  }

  // Check for duplicate in this tenant
  const existingRoles = await auth.getAllRoles({ tenantId: tenantId as any });
  const duplicate = existingRoles.find(
    (r: Record<string, any>) => r.name?.toLowerCase() === body.displayName.toLowerCase(),
  );
  if (duplicate) {
    return scimError(409, "Group already exists", "uniqueness");
  }

  // Create role via dbAdapter scoped to tenant
  const roleResult = await auth.authInterface.createRole({
    name: body.displayName,
    permissions: body.permissions || [],
    tenantId,
  } as any);

  const newRole = roleResult?.success ? roleResult.data : null;
  if (!newRole) {
    throw new Error("Failed to create group");
  }

  logger.info("SCIM Group created", {
    groupId: newRole._id,
    name: body.displayName,
    tenantId,
  });
  return json(buildScimGroup(newRole, url.origin), { status: 201 });
});
