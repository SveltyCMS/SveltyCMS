/**
 * @file src/routes/api/scim/v2/Users/[id]/+server.ts
 * @description Individual SCIM v2 User resource endpoint (RFC 7644 §3.4.1, §3.5.1, §3.5.2)
 *
 * Features:
 * - GET single user by ID
 * - PUT full user replace
 * - PATCH partial update (activate/deactivate, field updates)
 * - DELETE user deactivation
 */

import { auth } from "@src/databases/db";
import type { DatabaseId } from "@src/databases/db-interface";
import { SCIM_SCHEMAS } from "@src/types/scim";
import type { ScimPatchRequest } from "@src/types/scim";
import { json } from "@sveltejs/kit";
import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger.server";
import { applyScimPatchOps, buildScimUser, scimError, validateScimAuth } from "@utils/scim-utils";

// GET /api/scim/v2/Users/{id} — Fetch a single user
export const GET = apiHandler(async ({ params, url, locals, request }) => {
  const authResult = await validateScimAuth(request, locals);
  if (!authResult.authenticated) {
    return scimError(401, authResult.error || "Unauthorized");
  }

  const { id } = params;
  if (!id) {
    return scimError(400, "User ID is required", "invalidValue");
  }

  const tenantId = authResult.tenantId;

  if (!auth) {
    throw new AppError("Authentication service not available", 500, "AUTH_UNAVAILABLE");
  }

  const user = await auth.getUserById(id as DatabaseId, { tenantId: tenantId as DatabaseId });
  if (!user) {
    return scimError(404, `User ${id} not found`, "invalidValue");
  }

  return json(buildScimUser(user, url.origin));
});

// PUT /api/scim/v2/Users/{id} — Full user replace
export const PUT = apiHandler(async ({ params, request, url, locals }) => {
  const authResult = await validateScimAuth(request, locals);
  if (!authResult.authenticated) {
    return scimError(401, authResult.error || "Unauthorized");
  }

  const { id } = params;
  const tenantId = authResult.tenantId;

  if (!id || !auth) {
    return scimError(400, "User ID is required", "invalidValue");
  }

  const body = await request.json().catch(() => {
    throw new AppError("Invalid JSON payload", 400, "INVALID_JSON");
  });

  const existingUser = await auth.getUserById(id as DatabaseId, {
    tenantId: tenantId as DatabaseId,
  });
  if (!existingUser) {
    return scimError(404, `User ${id} not found`, "invalidValue");
  }

  // Map SCIM fields to DB fields - Implementing Full Replace per RFC
  const updates: Record<string, any> = {
    email: body.userName || "",
    username: body.name?.givenName || "",
    lastName: body.name?.familyName || "",
    blocked: body.active === false,
    // Clear optional fields if not in payload (Full Replace)
    firstName: body.name?.givenName || "",
    role: "VIEWER", // Default or keep current if not provided? RFC says replace.
  };

  if (body.emails?.length) {
    const primary = body.emails.find((e: any) => e.primary) || body.emails[0];
    if (primary?.value) updates.email = primary.value;
  }

  await auth.updateUser(id as DatabaseId, updates as any, { tenantId: tenantId as DatabaseId });
  const updatedUser = await auth.getUserById(id as DatabaseId, {
    tenantId: tenantId as DatabaseId,
  });

  logger.info("SCIM User replaced (full)", { userId: id, tenantId });
  return json(buildScimUser(updatedUser || existingUser, url.origin));
});

// PATCH /api/scim/v2/Users/{id} — Partial update (RFC 7644 §3.5.2)
export const PATCH = apiHandler(async ({ params, request, url, locals }) => {
  const authResult = await validateScimAuth(request, locals);
  if (!authResult.authenticated) {
    return scimError(401, authResult.error || "Unauthorized");
  }

  const { id } = params;
  const tenantId = authResult.tenantId;

  if (!id || !auth) {
    return scimError(400, "User ID is required", "invalidValue");
  }

  const body: ScimPatchRequest = await request.json().catch(() => {
    throw new AppError("Invalid JSON payload", 400, "INVALID_JSON");
  });

  // Validate SCIM PATCH schema
  if (!body.schemas?.includes(SCIM_SCHEMAS.PATCH_OP)) {
    return scimError(400, "Request must include PatchOp schema", "invalidValue");
  }

  if (!Array.isArray(body.Operations) || body.Operations.length === 0) {
    return scimError(400, "Operations array is required", "invalidValue");
  }

  const existingUser = await auth.getUserById(id as DatabaseId, {
    tenantId: tenantId as DatabaseId,
  });
  if (!existingUser) {
    return scimError(404, `User ${id} not found`, "invalidValue");
  }

  // Apply SCIM PATCH operations
  const updates = applyScimPatchOps(existingUser, body.Operations);

  if (Object.keys(updates).length > 0) {
    await auth.updateUserAttributes(id as DatabaseId, updates, {
      tenantId: tenantId as DatabaseId,
    });
  }

  const updatedUser = await auth.getUserById(id as DatabaseId, {
    tenantId: tenantId as DatabaseId,
  });
  logger.info("SCIM User patched", {
    userId: id,
    ops: body.Operations.length,
    tenantId,
  });
  return json(buildScimUser(updatedUser || existingUser, url.origin));
});

// DELETE /api/scim/v2/Users/{id} — Deactivate user (soft delete)
export const DELETE = apiHandler(async ({ params, request, locals }) => {
  const authResult = await validateScimAuth(request, locals);
  if (!authResult.authenticated) {
    return scimError(401, authResult.error || "Unauthorized");
  }

  const { id } = params;
  const tenantId = authResult.tenantId;

  if (!id || !auth) {
    return scimError(400, "User ID is required", "invalidValue");
  }

  const existingUser = await auth.getUserById(id as DatabaseId, {
    tenantId: tenantId as DatabaseId,
  });
  if (!existingUser) {
    return scimError(404, `User ${id} not found`, "invalidValue");
  }

  // Soft delete: deactivate user instead of hard delete
  // Soft delete: deactivate user using system convention (blocked: true)
  await auth.updateUser(id as DatabaseId, { blocked: true } as any, {
    tenantId: tenantId as DatabaseId,
  });

  logger.info("SCIM User deactivated", { userId: id, tenantId });
  return new Response(null, { status: 204 });
});
