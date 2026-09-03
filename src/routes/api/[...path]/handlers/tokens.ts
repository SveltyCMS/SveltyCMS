/**
 * @file src/routes/api/[...path]/handlers/tokens.ts
 * @description
 * Authentication token handlers for managing invites, password resets, and API keys.
 * Handles validation, creation, listing, updating, deletion, and batch actions.
 *
 * ### Features:
 * - Dynamic token validation and CRUD
 * - Batch operations (block, unblock, delete)
 * - Multi-tenant token isolation
 */

import { type RequestEvent } from "@sveltejs/kit";
import { type LocalCMS } from "@src/services/sdk";
import { type DatabaseId } from "@src/databases/db-interface";
import { rawResponse, successResponse } from "./base";
import { raise } from "@utils/error-handling";
import { getClientIp, isAdmin } from "@utils/hook-utils";
import { parsePaginationQueryParams } from "@src/utils/api-params";
import { recordListQuery } from "@utils/list-query-metrics";

export async function handleTokenRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const { request, url, locals } = event;

  // segments[0] is always "token" or "website-tokens"
  // segments[1] can be an action (list, create-token, validate-token) or a tokenId
  let action = segments[1];
  let tokenId = segments[2];

  // If segments[1] is NOT a known action, and it exists, it might be the tokenId
  const KNOWN_ACTIONS = ["list", "create-token", "validate-token", "batch", "resolve"];
  if (action && !KNOWN_ACTIONS.includes(action)) {
    tokenId = action;
    if (request.method === "DELETE") {
      action = "delete";
    } else if (request.method === "PUT" || request.method === "PATCH") {
      action = "update";
    } else {
      action = "validate-token"; // Default action for /api/token/[tokenId] (GET)
    }
  }

  // Default action for /api/token
  if (!action) {
    action = request.method === "POST" ? "create-token" : "list";
  }

  // GET /api/token or /api/token/list -> List all tokens (requires admin)
  if (request.method === "GET" && action === "list") {
    // Accept either the hook-computed admin flag or the canonical isAdmin(user)
    // check. Admins authenticated via the authorization fast-path carry a
    // UUID/role-name role rather than the literal "admin", so the old
    // `role !== "admin"` string compare wrongly 403'd them.
    if (!locals.user || !(locals.isAdmin || isAdmin(locals.user))) {
      raise(403, "Forbidden", "FORBIDDEN");
    }
    const isWebsite = segments[0] === "website-tokens";
    const { page, limit, search, sort, order, raw } = parsePaginationQueryParams(
      url.searchParams,
      10,
    );

    const t0 = performance.now();
    if (isWebsite) {
      const result = await cms.websiteTokens.list({
        tenantId,
        page,
        limit,
        sort,
        order,
      });

      const durationMs = performance.now() - t0;
      recordListQuery({
        source: "Tokens.list",
        durationMs,
        cache: "miss",
        rowCount: Array.isArray(result.data) ? result.data.length : 0,
      });

      if (raw) {
        return rawResponse(event, { success: true, data: result.data });
      }

      return rawResponse(event, {
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    }

    const result = await cms.auth.tokens.list({
      tenantId,
      search,
      page,
      limit,
      sort,
      order,
    });

    const durationMs = performance.now() - t0;
    recordListQuery({
      source: "Tokens.list",
      durationMs,
      cache: "miss",
      rowCount: result.success && Array.isArray(result.data) ? result.data.length : 0,
    });

    if (!result.success) return successResponse(event, result);

    if (raw) {
      return rawResponse(event, result.data);
    }

    return rawResponse(event, {
      success: true,
      data: result.data,
      pagination: (result as any).meta?.pagination,
    });
  }

  // GET /api/token/validate-token/:tokenId or /api/token/:tokenId -> Public validation
  if (request.method === "GET" && action === "validate-token") {
    if (!tokenId) raise(400, "Token ID is required", "BAD_REQUEST");

    // Try validating using the auth system
    const validateRes = await cms.auth.validateToken(tokenId, {
      tenantId,
      type: (url.searchParams.get("type") as any) || "invite-token",
    });

    if (validateRes.success && validateRes.data?.success) {
      return successResponse(event, {
        valid: true,
        email: validateRes.data.email,
        details: validateRes.data.details,
      });
    }

    raise(404, "Token not found or invalid", "NOT_FOUND");
  }

  // All other methods require authentication
  if (!locals.user) raise(401, "Authentication required", "UNAUTHORIZED");

  const isWebsite = segments[0] === "website-tokens";
  if (isWebsite && !(locals.isAdmin || isAdmin(locals.user))) {
    raise(403, "Forbidden", "FORBIDDEN");
  }

  if (request.method === "POST") {
    const body = await request.json().catch(() => ({}));

    if (action === "create-token") {
      // Rate limit password reset token creation (1 per 60s per IP)
      if (body.type === "reset") {
        const clientIp = getClientIp(event);
        const resetKey = `rate:reset:${clientIp}`;
        const { cacheService } = await import("@src/databases/cache/cache-service");
        const recent = await cacheService.get(resetKey);
        if (recent) {
          raise(429, "Password reset already requested. Please wait 60 seconds.", "RATE_LIMITED");
        }
        await cacheService.set(resetKey, "1", 60);
      }

      if (isWebsite) {
        if (!body.name) raise(400, "Name is required", "VALIDATION_FAILED");
        // Allow the client to override tenantId (null = global scope)
        const tokenTenantId = body.tenantId !== undefined ? body.tenantId : tenantId;
        const result = await cms.websiteTokens.create({
          name: body.name,
          permissions: body.permissions,
          expiresAt: body.expiresAt,
          user: locals.user,
          tenantId: tokenTenantId,
        });
        return rawResponse(event, result, 201);
      }

      if (body.expiresIn && !body.expires) body.expires = body.expiresIn;
      const result = await cms.auth.tokens.create({
        ...body,
        userId: locals.user?._id,
        tenantId,
      });
      if (!(result as any).success)
        raise(400, (result as any).message || "Failed to create token", "BAD_REQUEST");

      // Test expects { success: true, token: { value: ... } }
      return rawResponse(event, {
        success: true,
        token: { value: (result as any).data },
      });
    }

    if (action === "batch") {
      const ids = body.ids || body.tokenIds;
      const op = body.op || body.action;
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        raise(400, "Array of IDs required", "INVALID_BATCH_IDS");
      }

      const MAX_BATCH_SIZE = 100;
      if (ids.length > MAX_BATCH_SIZE) {
        raise(400, `Batch size exceeds maximum limit of ${MAX_BATCH_SIZE}`, "INVALID_BATCH_SIZE");
      }

      switch (op) {
        case "delete": {
          if (isWebsite) {
            const res = await cms.websiteTokens.deleteMany(ids.map(String), { tenantId });
            return successResponse(event, { deletedCount: res.deletedCount ?? ids.length });
          }
          const res = await cms.auth.tokens.deleteMany(ids.map(String), { tenantId });
          const deletedCount =
            (res as any)?.data?.deletedCount ?? (res as any)?.deletedCount ?? ids.length;
          return successResponse(event, { deletedCount });
        }
        case "block":
          if (isWebsite) raise(400, "Block not supported for website tokens", "BAD_REQUEST");
          return successResponse(event, await cms.auth.tokens.block(ids, { tenantId }));
        case "unblock":
          if (isWebsite) raise(400, "Unblock not supported for website tokens", "BAD_REQUEST");
          return successResponse(event, await cms.auth.tokens.unblock(ids, { tenantId }));
        default:
          raise(400, `Unsupported batch operation: ${op}`, "INVALID_BATCH_ACTION");
      }
    }
  }

  if (request.method === "DELETE" && action === "delete") {
    if (!tokenId) raise(400, "Token ID is required", "BAD_REQUEST");
    if (isWebsite) {
      return successResponse(event, await cms.websiteTokens.delete(tokenId, { tenantId }));
    }
    return successResponse(event, await cms.auth.tokens.delete(tokenId, { tenantId }));
  }

  if (request.method === "PUT" && action === "update") {
    if (!tokenId) raise(400, "Token ID is required");
    const body = await request.json().catch(() => ({}));
    const updateData = body.newTokenData || body.data || body;

    if (isWebsite) {
      // Website token update: delegate to websiteTokens module
      const result = await cms.websiteTokens.update(tokenId, updateData, {
        tenantId,
      });
      if (!result) raise(404, "Website token not found");
      return successResponse(event, result);
    }

    const result = await cms.auth.tokens.update(tokenId, updateData, {
      tenantId,
    });
    if (!result) raise(404, "Token not found");
    return successResponse(event, result);
  }

  raise(404, `Method ${request.method} or action ${action} not implemented`);
}

function scrubApiKey(key: any) {
  const { hash: _hash, ...safe } = key;
  return safe;
}

/**
 * Admin API key lifecycle — create, list, revoke machine-to-machine credentials.
 */
export async function handleApiKeyRoutes(
  event: RequestEvent,
  tenantId: DatabaseId,
  segments: string[],
) {
  const { request, locals, url } = event;
  const keyId = segments[1];

  const { auth, getDbInitPromise } = await import("@src/databases/db");
  const { generateApiKey } = await import("@src/databases/auth/api-keys");
  const { nowISODateString } = await import("@utils/date");
  const { validateRequestBody } = await import("./base");
  const v = await import("valibot");

  const schema = v.object({
    name: v.pipe(v.string(), v.minLength(1, "Name is required")),
    userId: v.optional(v.string()),
    permissions: v.optional(v.array(v.string()), []),
    scopes: v.optional(v.array(v.string()), []),
    expiresAt: v.optional(v.string()),
  });

  await getDbInitPromise();
  if (!auth) {
    raise(503, "Authentication system unavailable", "SERVICE_UNAVAILABLE");
  }

  if (!locals.user) {
    raise(401, "Unauthorized", "UNAUTHORIZED");
  }

  const userIsAdmin = !!(locals.isAdmin || isAdmin(locals.user));
  const dbOptions = { tenantId: tenantId ?? undefined };

  if (request.method === "GET" && !keyId) {
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10), 100);
    const skip = (page - 1) * limit;

    const filter: { userId?: DatabaseId; tenantId?: DatabaseId | null } = {
      tenantId,
    };
    if (!userIsAdmin) {
      filter.userId = locals.user._id as DatabaseId;
    } else {
      const userIdFilter = url.searchParams.get("userId");
      if (userIdFilter) filter.userId = userIdFilter as DatabaseId;
    }

    const result = await auth!.listApiKeys(filter, { limit, skip });
    if (!result.success) {
      raise(500, result.message || "Failed to list API keys");
    }

    return rawResponse(event, {
      success: true,
      data: (result.data || []).map(scrubApiKey),
      pagination: { page, limit, totalItems: result.data?.length || 0 },
    });
  }

  if (request.method === "POST" && !keyId) {
    if (!userIsAdmin && !locals.user._id) {
      raise(403, "Forbidden", "FORBIDDEN");
    }

    const body = await validateRequestBody(event, schema);

    const { full, prefix, hash } = generateApiKey();
    const createResult = await auth!.createApiKey(
      {
        name: body.name,
        hash,
        prefix,
        userId: (body.userId as DatabaseId) || (locals.user._id as DatabaseId),
        permissions: body.permissions || [],
        scopes: body.scopes || [],
        expiresAt: body.expiresAt,
        tenantId,
        revoked: false,
        usageCount: 0,
        createdAt: nowISODateString() as any,
      },
      dbOptions,
    );

    if (!createResult.success || !createResult.data) {
      raise(500, createResult.message || "Failed to create API key");
    }

    return rawResponse(
      event,
      {
        success: true,
        data: {
          ...scrubApiKey(createResult.data),
          key: full,
          apiKey: full,
        },
      },
      201,
    );
  }

  if (request.method === "DELETE" && keyId) {
    const existing = await auth!.getApiKeyById(keyId, dbOptions);
    if (!existing.success || !existing.data) {
      raise(404, "API key not found", "NOT_FOUND");
    }

    if (!userIsAdmin && existing.data.userId !== locals.user._id) {
      raise(403, "Forbidden", "FORBIDDEN");
    }

    const result = await auth!.revokeApiKey(keyId, dbOptions);
    if (!result.success) {
      raise(500, result.message || "Failed to revoke API key");
    }

    return successResponse(event, { revoked: true });
  }

  raise(405, `Method ${request.method} not allowed for /api/api-keys`);
}
