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
  if (!action) action = "list";

  // GET /api/token or /api/token/list -> List all tokens (requires admin)
  if (request.method === "GET" && action === "list") {
    if (!locals.user || locals.user.role !== "admin") {
      throw new AppError("Forbidden", 403, "FORBIDDEN");
    }
    const search = url.searchParams.get("search") || undefined;
    const pageStr = url.searchParams.get("page");
    const limitStr = url.searchParams.get("limit");
    const page = pageStr ? parseInt(pageStr, 10) : undefined;
    const limit = limitStr ? parseInt(limitStr, 10) : undefined;
    const sort = url.searchParams.get("sort") || undefined;
    const order = url.searchParams.get("order") as "asc" | "desc" | undefined;

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

  if (request.method === "POST") {
    const body = await request.json().catch(() => ({}));

    if (action === "create-token") {
      if (body.expiresIn && !body.expires) body.expires = body.expiresIn;
      const result = await cms.auth.tokens.create({
        ...body,
        userId: locals.user?._id,
        tenantId,
      });
      if (!result.success) throw new AppError(result.message || "Failed to create token", 400);

      // Test expects { success: true, token: { value: ... } }
      return rawResponse(event, { success: true, token: { value: result.data } });
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
            results.push(await cms.auth.tokens.delete(String(id), { tenantId }));
          }
          return successResponse(event, { deletedCount: results.length });
        }
        case "block":
          return successResponse(event, await cms.auth.tokens.block(ids, { tenantId }));
        case "unblock":
          return successResponse(event, await cms.auth.tokens.unblock(ids, { tenantId }));
        default:
          throw new AppError(`Unsupported batch operation: ${op}`, 400);
      }
    }
  }

  if (request.method === "DELETE" && action === "delete") {
    if (!tokenId) throw new AppError("Token ID is required", 400);
    return successResponse(event, await cms.auth.tokens.delete(tokenId, { tenantId }));
  }

  if (request.method === "PUT" && action === "update") {
    if (!tokenId) throw new AppError("Token ID is required", 400);
    const body = await request.json().catch(() => ({}));
    const updateData = body.newTokenData || body.data || body;
    const result = await cms.auth.tokens.update(tokenId, updateData, { tenantId });
    if (!result) throw new AppError("Token not found", 404);
    return successResponse(event, result);
  }

  throw new AppError(`Method ${request.method} or action ${action} not implemented`, 404);
}
