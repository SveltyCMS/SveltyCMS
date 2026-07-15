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
    const search = url.searchParams.get("search") || undefined;
    const pageStr = url.searchParams.get("page");
    const limitStr = url.searchParams.get("limit");
    const page = pageStr ? parseInt(pageStr, 10) : undefined;
    const limit = limitStr ? parseInt(limitStr, 10) : undefined;
    const sort = url.searchParams.get("sort") || undefined;
    const order = url.searchParams.get("order") as "asc" | "desc" | undefined;

    if (isWebsite) {
      const result = await cms.websiteTokens.list({
        tenantId,
        page: page || 1,
        limit: limit || 10,
        sort,
        order,
      });

      if (url.searchParams.get("raw") === "true") {
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

    if (!result.success) return successResponse(event, result);

    if (url.searchParams.get("raw") === "true") {
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
    if (!tokenId) throw new AppError("Token ID is required", 400);

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

    throw new AppError("Token not found or invalid", 404);
  }

  // All other methods require authentication
  if (!locals.user) throw new AppError("Authentication required", 401);

  const isWebsite = segments[0] === "website-tokens";

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
          throw new AppError("Password reset already requested. Please wait 60 seconds.", 429);
        }
        await cacheService.set(resetKey, "1", 60);
      }

      if (isWebsite) {
        if (!body.name) throw new AppError("Name is required", 400);
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
        throw new AppError((result as any).message || "Failed to create token", 400);

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
        throw new AppError("Array of IDs required", 400);
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
          if (isWebsite) throw new AppError("Block not supported for website tokens", 400);
          return successResponse(event, await cms.auth.tokens.block(ids, { tenantId }));
        case "unblock":
          if (isWebsite) throw new AppError("Unblock not supported for website tokens", 400);
          return successResponse(event, await cms.auth.tokens.unblock(ids, { tenantId }));
        default:
          throw new AppError(`Unsupported batch operation: ${op}`, 400);
      }
    }
  }

  if (request.method === "DELETE" && action === "delete") {
    if (!tokenId) throw new AppError("Token ID is required", 400);
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
