/**
 * @file src/routes/api/[...path]/handlers/scim.ts
 * @description SCIM 2.0 (RFC 7644) compliant identity management — Users, Groups, Bulk, Schemas, ServiceProviderConfig.
 *
 * Responsibilities:
 * - Bearer token authentication for SCIM endpoints
 * - User CRUD with SCIM filter/patch support (eq, co, sw, pr)
 * - Group management with membership operations
 * - Bulk operations with bulkId cross-reference resolution
 * - Schema and ServiceProviderConfig discovery endpoints
 */

import { logger } from "@utils/logger";
import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import { json } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";
import {
  validateScimAuth,
  scimError,
  buildScimUser,
  buildScimGroup,
  buildScimListResponse,
  applyScimPatchOps,
  parseScimActive,
  ScimValueError,
  parseScimFilter,
  matchesScimFilter,
} from "@src/utils/scim-utils";
import { auth as dbAuth } from "@src/databases/db";
import { SCIM_SCHEMAS } from "@src/types/scim";

// ─── Main Dispatcher ─────────────────────────────────────────────────────────

export async function handleScimRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const { request, url, locals } = event;
  const baseUrl = url.origin;

  try {
    // ── SCIM Bearer Token Authentication ──
    const authResult = await validateScimAuth(request, locals);
    if (!authResult.authenticated) {
      return scimError(401, authResult.error || "SCIM authentication failed");
    }

    const activeTenantId = (authResult.tenantId as DatabaseId) || tenantId;

    if (segments[1] !== "v2") {
      throw new AppError("Only SCIM v2.0 is supported", 400);
    }

    // ── Route by resource type ──
    const resourceType = segments[2];
    const resourceId = segments[3];

    switch (resourceType) {
      case "Users":
        return handleScimUsers(event, cms, activeTenantId, resourceId, baseUrl);
      case "Groups":
        return handleScimGroups(event, cms, activeTenantId, resourceId, baseUrl);
      case "Bulk":
        return handleScimBulk(event, cms, activeTenantId, baseUrl);
      case "Schemas":
        return handleScimSchemas(baseUrl);
      case "ServiceProviderConfig":
        return handleScimConfig(baseUrl);
      default:
        throw new AppError(`SCIM resource type '${resourceType}' not supported`, 404);
    }
  } catch (err: any) {
    logger.error(`[SCIM Route Error] ${segments.join("/")}:`, err);
    if (err instanceof AppError) throw err;
    throw new AppError(err.message || "SCIM operation failed", 500);
  }
}

// ─── Discovery Endpoints ─────────────────────────────────────────────────────

/** Returns available SCIM schemas (User, Group). */
async function handleScimSchemas(_baseUrl: string) {
  return json(
    buildScimListResponse(
      [
        { id: SCIM_SCHEMAS.USER, name: "User", description: "User Account" },
        { id: SCIM_SCHEMAS.GROUP, name: "Group", description: "Group" },
      ],
      2,
    ),
  );
}

/** Returns ServiceProviderConfig per RFC 7644 §5. */
async function handleScimConfig(_baseUrl: string) {
  return json({
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
    patch: { supported: true },
    bulk: { supported: true, maxOperations: 100, maxPayloadSize: 1048576 },
    filter: { supported: true, maxResults: 200 },
    changePassword: { supported: false },
    sort: { supported: true },
    etag: { supported: true },
    authenticationSchemes: [
      {
        name: "OAuth Bearer Token",
        description: "Authentication using OAuth Bearer Token",
        specUri: "http://tools.ietf.org/html/rfc6750",
        type: "oauthbearertoken",
        primary: true,
      },
    ],
  });
}

// ─── Users Resource Handler ──────────────────────────────────────────────────

/**
 * SCIM /Users endpoint — full CRUD with filter and patch support.
 * RFC 7644 §3.2 (query), §3.3 (create), §3.5.2 (modify with PATCH).
 */
async function handleScimUsers(
  event: RequestEvent,
  _cms: LocalCMS,
  tenantId: DatabaseId,
  resourceId: string | undefined,
  baseUrl: string,
) {
  const { request, url } = event;
  if (!dbAuth) throw new AppError("Auth module not available", 503);

  // GET /Users — list with optional SCIM filter
  if (request.method === "GET" && !resourceId) {
    const filter = parseScimFilter(url.searchParams.get("filter"));
    const users = await dbAuth.getAllUsers({ filter: { tenantId } }, { tenantId });
    const filtered = users.filter((u: any) => matchesScimFilter(u, filter));
    return json(
      buildScimListResponse(
        filtered.map((u: any) => buildScimUser(u, baseUrl)),
        filtered.length,
      ),
    );
  }

  // GET /Users/{id} — single user
  if (request.method === "GET" && resourceId) {
    const user = await dbAuth.getUserById(resourceId as DatabaseId, {
      tenantId,
    });
    if (!user) return scimError(404, "User not found");
    return json(buildScimUser(user, baseUrl));
  }

  // POST /Users — create
  if (request.method === "POST" && !resourceId) {
    const body = await request.json();
    const existing = await dbAuth.checkUser({ email: body.userName, tenantId });
    if (existing) return scimError(409, "User already exists");

    // A create with active:false provisions an already-deactivated account.
    let createActive = true;
    if ("active" in body) {
      try {
        createActive = parseScimActive(body.active);
      } catch (err) {
        if (err instanceof ScimValueError) return scimError(400, err.message);
        throw err;
      }
    }

    const newUser = await dbAuth.createUser({
      email: body.userName,
      username: body.displayName || body.name?.givenName || body.userName.split("@")[0],
      lastName: body.name?.familyName || "",
      role: "user", // SCIM provisions regular users; RBAC grants roles separately
      tenantId,
    });
    if (!createActive) {
      await dbAuth.updateUser(
        newUser._id as DatabaseId,
        { isActive: false, blocked: true },
        { tenantId },
      );
      const deactivated = await dbAuth.getUserById(newUser._id as DatabaseId, { tenantId });
      return json(buildScimUser(deactivated ?? newUser, baseUrl), { status: 201 });
    }
    return json(buildScimUser(newUser, baseUrl), { status: 201 });
  }

  // PATCH /Users/{id} — partial update (RFC 7644 §3.5.2)
  if (request.method === "PATCH" && resourceId) {
    const user = await dbAuth.getUserById(resourceId as DatabaseId, {
      tenantId,
    });
    if (!user) return scimError(404, "User not found");

    const body = await request.json();
    let updates: Record<string, unknown>;
    try {
      updates = applyScimPatchOps(user, body.Operations);
    } catch (err) {
      if (err instanceof ScimValueError) return scimError(400, err.message);
      throw err;
    }
    await dbAuth.updateUser(resourceId as DatabaseId, updates, { tenantId });
    const updated = await dbAuth.getUserById(resourceId as DatabaseId, {
      tenantId,
    });
    // The user can disappear between the update and the re-read (concurrent
    // DELETE); SCIM answers 404, not a 500 from a null dereference.
    if (!updated) return scimError(404, "User not found");
    return json(buildScimUser(updated, baseUrl));
  }

  // PUT /Users/{id} — full replace
  if (request.method === "PUT" && resourceId) {
    const body = await request.json();

    const updates: Record<string, unknown> = {};
    // RFC 7644 §3.3: a field that the request omits is not written as
    // `undefined` (which would blank the column); a field it supplies replaces
    // the stored value.
    const displayName = body.displayName || body.name?.givenName;
    if (displayName !== undefined) updates.username = displayName;
    if (body.name?.familyName !== undefined) updates.lastName = body.name.familyName;

    // RFC 7644 §3.3: `active` is the deprovisioning switch of a full replace. It was
    // ignored here, so an IdP PUT with active:false left the account fully usable.
    // Wrong types are rejected rather than coerced (see parseScimActive).
    if ("active" in body) {
      try {
        const active = parseScimActive(body.active);
        updates.isActive = active;
        updates.blocked = !active;
      } catch (err) {
        if (err instanceof ScimValueError) return scimError(400, err.message);
        throw err;
      }
    }

    await dbAuth.updateUser(resourceId as DatabaseId, updates, { tenantId });
    const updated = await dbAuth.getUserById(resourceId as DatabaseId, {
      tenantId,
    });
    if (!updated) return scimError(404, "User not found");
    return json(buildScimUser(updated, baseUrl));
  }

  // DELETE /Users/{id} — soft-delete (deactivate per SCIM best practice)
  if (request.method === "DELETE" && resourceId) {
    await dbAuth.updateUser(resourceId as DatabaseId, { blocked: true }, { tenantId });
    return new Response(null, { status: 204 });
  }

  throw new AppError("Method Not Allowed", 405);
}

// ─── Groups Resource Handler ─────────────────────────────────────────────────

/**
 * SCIM /Groups endpoint — maps SveltyCMS roles to SCIM groups.
 * Supports listing, fetching, and membership PATCH operations.
 */
async function handleScimGroups(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  resourceId: string | undefined,
  baseUrl: string,
) {
  const { request } = event;
  if (!dbAuth) throw new AppError("Auth module not available", 503);

  // GET /Groups — list all roles as SCIM groups
  if (request.method === "GET" && !resourceId) {
    const roles = await dbAuth.getAllRoles({ tenantId });
    return json(
      buildScimListResponse(
        roles.map((r: any) => buildScimGroup(r, baseUrl)),
        roles.length,
      ),
    );
  }

  // GET /Groups/{id} — single group
  if (request.method === "GET" && resourceId) {
    const role = await cms.db.auth!.getRoleById(resourceId as DatabaseId, {
      tenantId,
    });
    if (!role.success || !role.data) return scimError(404, "Group not found");
    return json(buildScimGroup(role.data, baseUrl));
  }

  // PATCH /Groups/{id} — membership management
  if (request.method === "PATCH" && resourceId) {
    const role = await cms.db.auth!.getRoleById(resourceId as DatabaseId, {
      tenantId,
    });
    if (!role.success || !role.data) return scimError(404, "Group not found");

    const body = await request.json();
    const operations = Array.isArray(body.Operations) ? body.Operations : [];
    for (const op of operations) {
      if (op.op.toLowerCase() === "add" && op.path === "members") {
        // RFC 7644 §3.5.2 allows `value` to be a single object or an array of
        // objects; a missing value is a no-op rather than a 500.
        const members = Array.isArray(op.value) ? op.value : op.value ? [op.value] : [];
        const userIds = members
          .map((member: unknown) =>
            member && typeof member === "object" ? (member as { value?: unknown }).value : member,
          )
          .filter((id: unknown): id is string => typeof id === "string" && id.length > 0);
        if (userIds.length > 0) {
          await cms.db.crud.updateMany(
            "users",
            { _id: { $in: userIds } },
            { role: role.data.name } as any,
            { tenantId },
          );
        }
      }
    }
    const updated = await cms.db.auth!.getRoleById(resourceId as DatabaseId, {
      tenantId,
    });
    if (!updated.success || !updated.data) return scimError(500, "Failed to fetch updated role");
    return json(buildScimGroup(updated.data, baseUrl));
  }

  throw new AppError("Method Not Allowed", 405);
}

// ─── Bulk Operations Handler ─────────────────────────────────────────────────

/**
 * SCIM Bulk endpoint (RFC 7644 §3.7).
 * Processes multiple operations in a single request with bulkId cross-reference
 * resolution for dependent creates.
 *
 * Supports failOnErrors threshold — stops processing after N failures.
 */
async function handleScimBulk(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  baseUrl: string,
) {
  const { request } = event;
  if (request.method !== "POST") throw new AppError("Method Not Allowed", 405);

  const body = await request.json();
  const operations = body.Operations || [];
  const bulkIdMap = new Map<string, string>();

  // Helper: execute a single bulk operation and return its result
  async function executeBulkOp(
    op: any,
    cms: LocalCMS,
    tenantId: DatabaseId,
    baseUrl: string,
    bulkIdMap: Map<string, string>,
  ): Promise<any> {
    const opPath = op.path || "";
    const pathSegments = opPath.split("/").filter(Boolean);
    const resourceType = pathSegments[0];
    const resourceId = pathSegments[1];

    const resolvedData = resolveBulkIdReferences(op.data || {}, bulkIdMap);

    const simulatedRequest = {
      method: op.method,
      json: async () => resolvedData,
      formData: async () => {
        throw new Error("FormData not supported in Bulk");
      },
    } as unknown as Request;

    const simulatedUrl = new URL(`${baseUrl}/api/scim/v2${opPath}`);
    const simulatedEvent = {
      request: simulatedRequest,
      url: simulatedUrl,
    } as unknown as RequestEvent;

    let response: Response;
    if (resourceType === "Users") {
      response = await handleScimUsers(simulatedEvent, cms, tenantId, resourceId, baseUrl);
    } else if (resourceType === "Groups") {
      response = await handleScimGroups(simulatedEvent, cms, tenantId, resourceId, baseUrl);
    } else {
      throw new AppError(`Unsupported bulk resource type: ${resourceType}`, 400);
    }

    const status = response.status;
    const resJson = status !== 204 ? await response.json() : null;

    const opResult: any = {
      method: op.method,
      status: { code: String(status) },
    };

    if (op.bulkId) {
      opResult.bulkId = op.bulkId;
      if (resJson?.id && op.method === "POST") {
        bulkIdMap.set(op.bulkId, resJson.id);
      }
    }

    if (resJson?.id) {
      opResult.location = `${baseUrl}/api/scim/v2/${resourceType}/${resJson.id}`;
    }
    if (resJson) opResult.response = resJson;

    return opResult;
  }

  // Classify: dependent ops reference bulkId cross-references, independent ops don't
  const dependentOps: { op: any; index: number }[] = [];
  const independentOps: { op: any; index: number }[] = [];

  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];
    const rawStringified = JSON.stringify(op);
    if (rawStringified.includes("bulkId:")) {
      dependentOps.push({ op, index: i });
    } else {
      independentOps.push({ op, index: i });
    }
  }

  // Pre-allocate results array
  const results: any[] = Array.from({ length: operations.length });

  // Execute independent ops concurrently
  await Promise.all(
    independentOps.map(async ({ op, index }) => {
      try {
        results[index] = await executeBulkOp(op, cms, tenantId, baseUrl, bulkIdMap);
      } catch (err: unknown) {
        const statusCode = (err as any).status || 500;
        results[index] = {
          method: op.method,
          bulkId: op.bulkId || undefined,
          status: { code: String(statusCode) },
          response: {
            schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
            status: String(statusCode),
            detail: err instanceof Error ? err.message : String(err) || "Bulk operation failed",
          },
        };
      }
    }),
  );

  // Execute dependent ops sequentially (they rely on bulkIdMap from previous ops)
  for (const { op, index } of dependentOps) {
    try {
      results[index] = await executeBulkOp(op, cms, tenantId, baseUrl, bulkIdMap);
    } catch (err: unknown) {
      const statusCode = (err as any).status || 500;
      results[index] = {
        method: op.method,
        bulkId: op.bulkId || undefined,
        status: { code: String(statusCode) },
        response: {
          schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
          status: String(statusCode),
          detail: err instanceof Error ? err.message : String(err) || "Bulk operation failed",
        },
      };
    }

    // Honor failOnErrors threshold
    if (body.failOnErrors) {
      const errorCount = results.filter((r) => r && Number(r.status?.code) >= 400).length;
      if (errorCount >= body.failOnErrors) break;
    }
  }

  // Filter nulls (failed independent ops might leave gaps — already handled above)
  const finalResults = results.filter(Boolean);

  return json({
    schemas: ["urn:ietf:params:scim:api:messages:2.0:BulkResponse"],
    Operations: finalResults,
  });
}

/**
 * Recursively resolves `bulkId:<id>` references in object/array hierarchies.
 * Used during bulk operations where one operation creates a resource and
 * subsequent operations reference it by its temporary bulkId.
 */
function resolveBulkIdReferences(data: any, bulkIdMap: Map<string, string>): any {
  if (typeof data !== "object" || data === null) {
    if (typeof data === "string" && data.startsWith("bulkId:")) {
      return bulkIdMap.get(data.slice(7)) || data;
    }
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => resolveBulkIdReferences(item, bulkIdMap));
  }

  const resolved: any = {};
  for (const [key, val] of Object.entries(data)) {
    resolved[key] = resolveBulkIdReferences(val, bulkIdMap);
  }
  return resolved;
}
