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
import { AppError } from "@utils/error-handling";
import { isAdmin } from "@utils/hook-utils";
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
      throw new AppError("Forbidden", 403, "FORBIDDEN");
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
      rowCount: Array.isArray(result.data) ? result.data.length : 0,
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
    if (!tokenId) throw new AppError("Token ID is required", 400, "BAD_REQUEST");

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

    throw new AppError("Token not found or invalid", 404, "NOT_FOUND");
  }

  // All other methods require authentication
  if (!locals.user) throw new AppError("Authentication required", 401, "UNAUTHORIZED");

  const isWebsite = segments[0] === "website-tokens";
  if (isWebsite && !(locals.isAdmin || isAdmin(locals.user))) {
    throw new AppError("Forbidden", 403, "FORBIDDEN");
  }

  if (request.method === "POST") {
    const body = await request.json().catch(() => ({}));

    if (action === "create-token") {
      // Rate limit password reset token creation (1 per 60s per IP)
      if (body.type === "reset") {
        const clientIp =
          event.request.headers.get("x-forwarded-for") || event.getClientAddress?.() || "unknown";
        const resetKey = `rate:reset:${clientIp}`;
        const { cacheService } = await import("@src/databases/cache/cache-service");
        const recent = await cacheService.get(resetKey);
        if (recent) {
          throw new AppError(
            "Password reset already requested. Please wait 60 seconds.",
            429,
            "RATE_LIMITED",
          );
        }
        await cacheService.set(resetKey, "1", 60);
      }

      if (isWebsite) {
        if (!body.name) throw new AppError("Name is required", 400, "VALIDATION_FAILED");
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
        throw new AppError((result as any).message || "Failed to create token", 400, "BAD_REQUEST");

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
        throw new AppError("Array of IDs required", 400, "INVALID_BATCH_IDS");
      }

      switch (op) {
        case "delete": {
          const results = [];
          for (const id of ids) {
            if (isWebsite) {
              results.push(await cms.websiteTokens.delete(String(id), { tenantId }));
            } else {
              results.push(await cms.auth.tokens.delete(String(id), { tenantId }));
            }
          }
          return successResponse(event, { deletedCount: results.length });
        }
        case "block":
          if (isWebsite)
            throw new AppError("Block not supported for website tokens", 400, "BAD_REQUEST");
          return successResponse(event, await cms.auth.tokens.block(ids, { tenantId }));
        case "unblock":
          if (isWebsite)
            throw new AppError("Unblock not supported for website tokens", 400, "BAD_REQUEST");
          return successResponse(event, await cms.auth.tokens.unblock(ids, { tenantId }));
        default:
          throw new AppError(`Unsupported batch operation: ${op}`, 400, "INVALID_BATCH_ACTION");
      }
    }
  }

  if (request.method === "DELETE" && action === "delete") {
    if (!tokenId) throw new AppError("Token ID is required", 400, "BAD_REQUEST");
    if (isWebsite) {
      return successResponse(event, await cms.websiteTokens.delete(tokenId, { tenantId }));
    }
    return successResponse(event, await cms.auth.tokens.delete(tokenId, { tenantId }));
  }

  if (request.method === "PUT" && action === "update") {
    if (!tokenId) throw new AppError("Token ID is required", 400);
    const body = await request.json().catch(() => ({}));
    const updateData = body.newTokenData || body.data || body;

    if (isWebsite) {
      // Website token update: delegate to websiteTokens module
      const result = await cms.websiteTokens.update(tokenId, updateData, {
        tenantId,
      });
      if (!result) throw new AppError("Website token not found", 404);
      return successResponse(event, result);
    }

    const result = await cms.auth.tokens.update(tokenId, updateData, {
      tenantId,
    });
    if (!result) throw new AppError("Token not found", 404);
    return successResponse(event, result);
  }

  throw new AppError(`Method ${request.method} or action ${action} not implemented`, 404);
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
    throw new AppError("Authentication system unavailable", 503, "SERVICE_UNAVAILABLE");
  }

  if (!locals.user) {
    throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
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
      throw new AppError(result.message || "Failed to list API keys", 500);
    }

    return rawResponse(event, {
      success: true,
      data: (result.data || []).map(scrubApiKey),
      pagination: { page, limit, totalItems: result.data?.length || 0 },
    });
  }

  if (request.method === "POST" && !keyId) {
    if (!userIsAdmin && !locals.user._id) {
      throw new AppError("Forbidden", 403, "FORBIDDEN");
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
      throw new AppError(createResult.message || "Failed to create API key", 500);
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
      throw new AppError("API key not found", 404, "NOT_FOUND");
    }

    if (!userIsAdmin && existing.data.userId !== locals.user._id) {
      throw new AppError("Forbidden", 403, "FORBIDDEN");
    }

    const result = await auth!.revokeApiKey(keyId, dbOptions);
    if (!result.success) {
      throw new AppError(result.message || "Failed to revoke API key", 500);
    }

    return successResponse(event, { revoked: true });
  }

  throw new AppError(`Method ${request.method} not allowed for /api/api-keys`, 405);
}
