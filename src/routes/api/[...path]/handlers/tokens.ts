/**
 * @file src/routes/api/[...path]/handlers/tokens.ts
 * @description API & Website token management handlers for the dispatcher.
 */

import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";
import { rawResponse, successResponse } from "./base";

export async function handleTokenRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const namespace = segments[0];
  const method = segments[1];

  if (namespace === "website-tokens") return handleWebsiteTokenRoutes(event, cms, tenantId, method);
  if (namespace === "token")
    return handleIdentityTokenRoutes(event, cms, tenantId, method, segments);

  throw new AppError(`Token endpoint /api/${segments.join("/")} not implemented`, 404);
}

export async function handleWebsiteTokenRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  method: string,
) {
  const { request, url, locals } = event;

  if (request.method === "GET") {
    const page = Number(url.searchParams.get("page") ?? 1);
    const limit = Number(url.searchParams.get("limit") ?? 10);
    const sort = url.searchParams.get("sort") ?? "createdAt";
    const order = (url.searchParams.get("order") ?? "desc") as "asc" | "desc";
    const result = await cms.websiteTokens.list({ tenantId, page, limit, sort, order });
    // Standardize structure: { success, data, pagination }
    return url.searchParams.get("raw") === "true"
      ? rawResponse(event, { data: result.data })
      : rawResponse(event, {
          success: true,
          data: result.data,
          pagination: {
            totalItems: result.pagination.totalItems,
            page,
            limit,
            totalPages: Math.ceil(result.pagination.totalItems / limit),
          },
        });
  }

  if (request.method === "POST") {
    const result = await cms.websiteTokens.create({
      ...(await request.json()),
      user: locals.user,
      tenantId,
    });
    return rawResponse(event, result, 201);
  }

  if (request.method === "DELETE" && method) {
    await cms.websiteTokens.delete(method, { tenantId });
    return new Response(null, { status: 204 });
  }
}

export async function handleIdentityTokenRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  method: string,
  segments: string[],
) {
  const { request, url, locals } = event;

  // Use segments to handle cases where method is part of the path (e.g. /api/token/createToken -> segments=["token", "createToken"])
  const action = segments[1] || method;

  if (request.method === "GET") {
    const tokenId = action;
    if (!tokenId || tokenId === "list") {
      if (!locals.user) throw new AppError("Authentication required", 401);
      const result = await cms.auth.tokens.list({
        tenantId,
        search: url.searchParams.get("search") || undefined,
        page: Number(url.searchParams.get("page")) || 1,
        limit: Number(url.searchParams.get("limit")) || 10,
        sort: url.searchParams.get("sort") || undefined,
        order: (url.searchParams.get("order") as "asc" | "desc") || "desc",
      });

      // Standardize structure: { success, data, pagination }
      return url.searchParams.get("raw") === "true"
        ? rawResponse(event, result.data)
        : rawResponse(event, {
            success: true,
            data: result.data,
            pagination: {
              totalItems: result.pagination.totalItems,
              page: Number(url.searchParams.get("page")) || 1,
              limit: Number(url.searchParams.get("limit")) || 10,
              totalPages: Math.ceil(
                result.pagination.totalItems / (Number(url.searchParams.get("limit")) || 10),
              ),
            },
          });
    }

    // 🚀 CRITICAL: If tokenId is a known action, it's not a valid token ID for GET
    if (["create-token", "batch", "resolve"].includes(tokenId)) {
      throw new AppError(`Action "${tokenId}" only supports POST`, 405);
    }

    // Try finding by ID first
    // This is public if it's an invitation token validation
    const token = await cms.auth.tokens.findById(tokenId, { tenantId });
    if (token) {
      // If the client expects the validation shape (valid: true)
      if (url.searchParams.get("validate") === "true" || !locals.user) {
        return successResponse(event, { ...token, valid: true });
      }
      return successResponse(event, token);
    }

    // If not found by technical ID, check if it's an invitation token value being validated
    const validateRes = await cms.auth.validateToken(tokenId as string, {
      tenantId,
      type: "invite-token",
      category: "general",
    });

    if (validateRes.success && validateRes.data?.success) {
      return successResponse(event, { ...validateRes.data, valid: true });
    }

    throw new AppError("Token not found or invalid", 404);
  }

  // All other methods (POST, PUT, DELETE) require authentication
  if (!locals.user) throw new AppError("Authentication required", 401);

  if ((request.method === "PATCH" || request.method === "PUT") && method) {
    const body = await request.json();
    const updateData = body.newTokenData || body.data || body;
    const result = await cms.auth.tokens.update(method, updateData, { tenantId });
    if (!result) throw new AppError("Token not found", 404);
    return successResponse(event, result);
  }

  if (request.method === "POST") {
    const body = await request.json();
    const normalizedAction = action.toLowerCase().replace("-", "");
    if (normalizedAction === "createtoken") {
      if (body.expiresIn && !body.expires) body.expires = body.expiresIn;
      const result = await cms.auth.tokens.create({ ...body, userId: locals.user?._id, tenantId });
      if (!result.success) throw new AppError(result.message || "Failed to create token", 400);
      const tokenValue = result.data;
      return rawResponse(
        event,
        { success: true, token: { value: tokenValue, token: tokenValue } },
        200,
      );
    }
    if (normalizedAction === "batch") {
      const { tokenIds, action: batchAction } = body;
      const act = batchAction || body.batchAction;
      if (!Array.isArray(tokenIds) || tokenIds.length === 0) {
        throw new AppError("tokenIds must be a non-empty array", 400);
      }
      return rawResponse(event, await cms.auth.tokens.batchAction(tokenIds, act, tenantId));
    }
    if (normalizedAction === "resolve") {
      const locale = (locals as any).locale || "en";
      const resolved = await cms.auth.tokens.resolve(body.text, locals.user, tenantId, locale);
      return successResponse(event, resolved);
    }
  }

  if (request.method === "DELETE" && method) {
    const result = await cms.auth.tokens.delete(method, { tenantId });
    if (!result.success || (result.data as any).deletedCount === 0) {
      throw new AppError("Token not found", 404);
    }
    return successResponse(event, { deletedCount: 1 });
  }
}
