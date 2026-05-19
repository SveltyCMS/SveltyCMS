/**
 * @file src/routes/api/[...path]/handlers/scim.ts
 * @description SCIM 2.0 (RFC 7644) modular handler for the dispatcher.
 */

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
  parseScimFilter,
  matchesScimFilter,
} from "@src/utils/scim-utils";
import { auth as dbAuth } from "@src/databases/db";
// Removed unused logger import

export async function handleScimRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const { request, url, locals } = event;
  const baseUrl = url.origin;

  // 1. SCIM Auth (Bearer Token validation)
  const authResult = await validateScimAuth(request, locals);
  if (!authResult.authenticated) {
    return scimError(401, authResult.error || "SCIM authentication failed");
  }

  // Use tenantId from token if available, otherwise from locals
  const activeTenantId = (authResult.tenantId as DatabaseId) || tenantId;

  // segments: ["scim", "v2", "Users", ...] or ["scim", "v2", "Groups", ...]
  if (segments[1] !== "v2") throw new AppError("Only SCIM v2.0 is supported", 400);

  const resourceType = segments[2]; // "Users", "Groups", "Schemas", "ServiceProviderConfig", "Bulk"
  const resourceId = segments[3];

  if (resourceType === "Users")
    return handleScimUsers(event, cms, activeTenantId, resourceId, baseUrl);
  if (resourceType === "Groups")
    return handleScimGroups(event, cms, activeTenantId, resourceId, baseUrl);
  if (resourceType === "Bulk") return handleScimBulk(event, cms, activeTenantId, baseUrl);
  if (resourceType === "Schemas") return handleScimSchemas(event, baseUrl);
  if (resourceType === "ServiceProviderConfig") return handleScimConfig(event, baseUrl);

  throw new AppError(`SCIM Resource ${resourceType} not implemented`, 404);
}

async function handleScimSchemas(_event: RequestEvent, _baseUrl: string) {
  const { SCIM_SCHEMAS } = await import("@src/types/scim");
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

async function handleScimConfig(_event: RequestEvent, _baseUrl: string) {
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
        description: "Authentication scheme using the OAuth Bearer Token standard.",
        specUri: "http://tools.ietf.org/html/rfc6750",
        type: "oauthbearertoken",
        primary: true,
      },
    ],
  });
}

async function handleScimUsers(
  event: RequestEvent,
  _cms: LocalCMS,
  tenantId: DatabaseId,
  resourceId: string | undefined,
  baseUrl: string,
) {
  const { request, url } = event;
  if (!dbAuth) throw new AppError("Auth module not available", 503);

  // --- GET /Users ---
  if (request.method === "GET" && !resourceId) {
    const filter = parseScimFilter(url.searchParams.get("filter"));
    const users = await dbAuth.getAllUsers({ filter: { tenantId } }, { tenantId });
    const filtered = users.filter((u: any) => matchesScimFilter(u, filter));
    const resources = filtered.map((u: any) => buildScimUser(u, baseUrl));
    return json(buildScimListResponse(resources, filtered.length));
  }

  // --- GET /Users/[id] ---
  if (request.method === "GET" && resourceId) {
    const user = await dbAuth.getUserById(resourceId as DatabaseId, { tenantId });
    if (!user) return scimError(404, "User not found");
    return json(buildScimUser(user, baseUrl));
  }

  // --- POST /Users (Create) ---
  if (request.method === "POST" && !resourceId) {
    const body = await request.json();
    const existing = await dbAuth.checkUser({ email: body.userName, tenantId });
    if (existing) return scimError(409, "User already exists");

    const newUser = await dbAuth.createUser({
      email: body.userName,
      username: body.displayName || body.name?.givenName || body.userName.split("@")[0],
      lastName: body.name?.familyName || "",
      tenantId,
    });
    return json(buildScimUser(newUser, baseUrl), { status: 201 });
  }

  // --- PATCH /Users/[id] ---
  if (request.method === "PATCH" && resourceId) {
    const user = await dbAuth.getUserById(resourceId as DatabaseId, { tenantId });
    if (!user) return scimError(404, "User not found");
    const body = await request.json();
    const updates = applyScimPatchOps(user, body.Operations);
    await dbAuth.updateUser(resourceId as DatabaseId, updates, { tenantId });
    const updated = await dbAuth.getUserById(resourceId as DatabaseId, { tenantId });
    return json(buildScimUser(updated!, baseUrl));
  }

  // --- PUT /Users/[id] ---
  if (request.method === "PUT" && resourceId) {
    const body = await request.json();
    const updates = {
      username: body.displayName || body.name?.givenName,
      lastName: body.name?.familyName,
    };
    await dbAuth.updateUser(resourceId as DatabaseId, updates, { tenantId });
    const updated = await dbAuth.getUserById(resourceId as DatabaseId, { tenantId });
    return json(buildScimUser(updated!, baseUrl));
  }

  // --- DELETE /Users/[id] (Deactivate) ---
  if (request.method === "DELETE" && resourceId) {
    await dbAuth.updateUser(resourceId as DatabaseId, { blocked: true }, { tenantId });
    return new Response(null, { status: 204 });
  }

  throw new AppError("Method Not Allowed", 405);
}

async function handleScimGroups(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  resourceId: string | undefined,
  baseUrl: string,
) {
  const { request } = event;
  if (!dbAuth) throw new AppError("Auth module not available", 503);

  // --- GET /Groups ---
  if (request.method === "GET" && !resourceId) {
    const roles = await dbAuth.getAllRoles({ tenantId });
    const resources = roles.map((r: any) => buildScimGroup(r, baseUrl));
    return json(buildScimListResponse(resources, roles.length));
  }

  // --- GET /Groups/[id] ---
  if (request.method === "GET" && resourceId) {
    const role = await cms.db.auth!.getRoleById(resourceId as DatabaseId, { tenantId });
    if (!role.success || !role.data) return scimError(404, "Group not found");
    // Optionally fetch members here if SveltyCMS supports it natively
    return json(buildScimGroup(role.data, baseUrl));
  }

  // --- PATCH /Groups/[id] (Membership) ---
  if (request.method === "PATCH" && resourceId) {
    const role = await cms.db.auth!.getRoleById(resourceId as DatabaseId, { tenantId });
    if (!role.success || !role.data) return scimError(404, "Group not found");
    const body = await request.json();

    for (const op of body.Operations) {
      if (op.op.toLowerCase() === "add" && op.path === "members") {
        const userIds = op.value.map((v: any) => v.value);
        await cms.db.crud.updateMany(
          "users",
          { _id: { $in: userIds } },
          { role: role.data.name } as any,
          { tenantId },
        );
      }
    }
    const updated = await cms.db.auth!.getRoleById(resourceId as DatabaseId, { tenantId });
    if (!updated.success || !updated.data) return scimError(500, "Failed to fetch updated role");
    return json(buildScimGroup(updated.data, baseUrl));
  }

  throw new AppError("Method Not Allowed", 405);
}

/**
 * Handle SCIM Bulk operations (RFC 7644 §3.7)
 */
async function handleScimBulk(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  baseUrl: string,
) {
  const { request } = event;
  if (request.method !== "POST") {
    throw new AppError("Method Not Allowed", 405);
  }

  const body = await request.json();
  const operations = body.Operations || [];
  const results: any[] = [];
  const bulkIdMap = new Map<string, string>();

  for (const op of operations) {
    try {
      const opPath = op.path || "";
      const pathSegments = opPath.split("/").filter(Boolean);
      const resourceType = pathSegments[0];
      const resourceId = pathSegments[1];

      // Resolve bulkId references in data
      const resolvedData = resolveBulkIdReferences(op.data || {}, bulkIdMap);

      // Construct simulated request event
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
        if (resJson && resJson.id && op.method === "POST") {
          bulkIdMap.set(op.bulkId, resJson.id);
        }
      }

      if (resJson && resJson.id) {
        opResult.location = `${baseUrl}/api/scim/v2/${resourceType}/${resJson.id}`;
      }

      if (resJson) {
        opResult.response = resJson;
      }

      results.push(opResult);
    } catch (err: any) {
      const status = err.status || 500;
      const opResult: any = {
        method: op.method,
        status: { code: String(status) },
        response: {
          schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
          status: String(status),
          detail: err.message || "Bulk operation failed",
        },
      };
      if (op.bulkId) {
        opResult.bulkId = op.bulkId;
      }
      results.push(opResult);

      if (body.failOnErrors && results.length >= body.failOnErrors) {
        break;
      }
    }
  }

  return json({
    schemas: ["urn:ietf:params:scim:api:messages:2.0:BulkResponse"],
    Operations: results,
  });
}

/**
 * Recursively resolves bulkId:<id> references in object/array hierarchies.
 */
function resolveBulkIdReferences(data: any, bulkIdMap: Map<string, string>): any {
  if (typeof data !== "object" || data === null) {
    if (typeof data === "string" && data.startsWith("bulkId:")) {
      const bulkId = data.slice(7);
      return bulkIdMap.get(bulkId) || data;
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
