/**
 * @file src/routes/api/scim/v2/Groups/[id]/+server.ts
 * @description Individual SCIM v2 Group resource endpoint (RFC 7644)
 *
 * Features:
 * - GET single group/role by ID with members
 * - PATCH add/remove members
 * - DELETE group/role
 */

import { auth, dbAdapter } from "@src/databases/db";
import type { DatabaseId } from "@src/content/types";
import { SCIM_SCHEMAS } from "@src/types/scim";
import type { ScimPatchRequest } from "@src/types/scim";
import { json } from "@sveltejs/kit";
import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger.server";
import { buildScimGroup, scimError, validateScimAuth } from "@utils/scim-utils";

// GET /api/scim/v2/Groups/{id} — Fetch a single group with members
export const GET = apiHandler(async ({ params, url, locals, request }) => {
  const authResult = await validateScimAuth(request, locals);
  if (!authResult.authenticated) {
    return scimError(401, authResult.error || "Unauthorized");
  }

  const { id } = params;
  const tenantId = authResult.tenantId;

  if (!id || !auth) {
    return scimError(400, "Group ID is required", "invalidValue");
  }

  const roleResult = await auth.authInterface.getRoleById(id as any, { tenantId: tenantId as any });
  const role = roleResult?.success ? roleResult.data : null;
  if (!role) {
    return scimError(404, `Group ${id} not found`, "invalidValue");
  }

  // Fetch members (users with this role) scoped to tenant - Optimizing to avoid OOM
  const usersResult = await auth.authInterface.getAllUsers({
    filter: {
      tenantId,
      $or: [{ role: role.name }, { role: role._id }],
    },
  });

  const members = (usersResult.success ? usersResult.data : []).map((u: any) => ({
    _id: u._id,
    email: u.email,
  }));

  return json(buildScimGroup(role, url.origin, members));
});

// PATCH /api/scim/v2/Groups/{id} — Add/remove members
export const PATCH = apiHandler(async ({ params, request, url, locals }) => {
  const authResult = await validateScimAuth(request, locals);
  if (!authResult.authenticated) {
    return scimError(401, authResult.error || "Unauthorized");
  }

  const { id } = params;
  const tenantId = authResult.tenantId;

  if (!id || !auth) {
    return scimError(400, "Group ID is required", "invalidValue");
  }

  const body: ScimPatchRequest = await request.json().catch(() => {
    throw new AppError("Invalid JSON payload", 400, "INVALID_JSON");
  });

  if (!body.schemas?.includes(SCIM_SCHEMAS.PATCH_OP)) {
    return scimError(400, "Request must include PatchOp schema", "invalidValue");
  }

  const roleResult = await auth.authInterface.getRoleById(id as any, { tenantId: tenantId as any });
  const role = roleResult?.success ? roleResult.data : null;
  if (!role) {
    return scimError(404, `Group ${id} not found`, "invalidValue");
  }

  // Process operations
  for (const op of body.Operations) {
    const path = op.path?.toLowerCase();

    if (path === "members" || !path) {
      if (op.op === "add" && Array.isArray(op.value)) {
        // Add members: assign this role to specified users using bulk update
        const userIds = (op.value as Array<{ value: string }>).map((v) => v.value);
        try {
          if (dbAdapter) {
            await dbAdapter.crud.updateMany(
              "users",
              { _id: { $in: userIds as any } },
              { role: role.name } as any,
              { tenantId: tenantId as any },
            );
            logger.info("SCIM Group members added in bulk", {
              groupId: id,
              count: userIds.length,
              tenantId,
            });
          }
        } catch (e) {
          logger.warn("SCIM Group bulk member add failed", {
            groupId: id,
            error: e,
          });
        }
      } else if (op.op === "remove" && Array.isArray(op.value)) {
        // Remove members: revert to default role using bulk update
        const userIds = (op.value as Array<{ value: string }>).map((v) => v.value);
        try {
          if (dbAdapter) {
            await dbAdapter.crud.updateMany(
              "users",
              { _id: { $in: userIds as any } },
              { role: "user" } as any,
              { tenantId: tenantId as DatabaseId },
            );
            logger.info("SCIM Group members removed in bulk", {
              groupId: id,
              count: userIds.length,
              tenantId,
            });
          }
        } catch (e) {
          logger.warn("SCIM Group bulk member remove failed", {
            groupId: id,
            error: e,
          });
        }
      } else if (op.op === "replace" && typeof op.value === "object" && op.value !== null) {
        // Replace group displayName
        const val = op.value as Record<string, any>;
        if (val.displayName) {
          await auth.authInterface.updateRole(id as any, { name: val.displayName } as any, {
            tenantId: tenantId as any,
          });
          logger.info("SCIM Group renamed", {
            groupId: id,
            newName: val.displayName,
            tenantId,
          });
        }
      }
    }
  }

  // Return updated group - Using optimized retrieval
  const [updatedRoleResult, usersResult] = await Promise.all([
    auth.authInterface.getRoleById(id as any, { tenantId: tenantId as any }),
    auth.authInterface.getAllUsers({
      filter: {
        tenantId,
        $or: [{ role: role.name }, { role: id }],
      },
    }),
  ]);

  const updatedRole = updatedRoleResult?.success ? updatedRoleResult.data : null;
  const currentRole = updatedRole || role;

  const members = (usersResult.success ? usersResult.data : []).map((u: any) => ({
    _id: u._id,
    email: u.email,
  }));

  return json(buildScimGroup(currentRole, url.origin, members));
});

// DELETE /api/scim/v2/Groups/{id} — Delete group/role
export const DELETE = apiHandler(async ({ params, request, locals }) => {
  const authResult = await validateScimAuth(request, locals);
  if (!authResult.authenticated) {
    return scimError(401, authResult.error || "Unauthorized");
  }

  const { id } = params;
  const tenantId = authResult.tenantId;

  if (!id || !auth) {
    return scimError(400, "Group ID is required", "invalidValue");
  }

  const roleResult = await auth.authInterface.getRoleById(id as any, { tenantId: tenantId as any });
  const role = roleResult?.success ? roleResult.data : null;
  if (!role) {
    return scimError(404, `Group ${id} not found`, "invalidValue");
  }

  // Prevent deletion of built-in admin role
  if (role.name === "admin" || role.isAdmin) {
    return scimError(400, "Cannot delete the admin role", "mutability");
  }

  await auth.authInterface.deleteRole(id as DatabaseId, { tenantId: tenantId as DatabaseId });
  logger.info("SCIM Group deleted", {
    groupId: id,
    roleName: role.name,
    tenantId,
  });
  return new Response(null, { status: 204 });
});
