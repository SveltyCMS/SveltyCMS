/**
 * @file src/routes/api/[...path]/handlers/api-keys.ts
 * @description Admin API key lifecycle — create, list, revoke machine-to-machine credentials.
 *
 * ### Features:
 * - POST returns plaintext key exactly once
 * - GET lists keys without hash material
 * - DELETE revokes and invalidates auth cache
 */

import type { RequestEvent } from "@sveltejs/kit";
import type { DatabaseId } from "@src/databases/db-interface";
import { auth, getDbInitPromise } from "@src/databases/db";
import { generateApiKey } from "@src/databases/auth/api-keys";
import { nowISODateString } from "@utils/date";
import { AppError } from "@utils/error-handling";
import { isAdmin } from "@utils/hook-utils";
import { rawResponse } from "./base";
import type { ApiKey } from "@src/databases/auth/types";

function scrubApiKey(key: ApiKey) {
  const { hash: _hash, ...safe } = key;
  return safe;
}

export async function handleApiKeyRoutes(
  event: RequestEvent,
  tenantId: DatabaseId,
  segments: string[],
) {
  const { request, locals, url } = event;
  const keyId = segments[1];

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

    const filter: { userId?: DatabaseId; tenantId?: DatabaseId | null } = { tenantId };
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

    const body = await request.json();
    const name = String(body?.name || "").trim();
    if (!name) throw new AppError("Name is required", 400, "VALIDATION_ERROR");

    const { full, prefix, hash } = generateApiKey();
    const createResult = await auth!.createApiKey(
      {
        name,
        hash,
        prefix,
        userId: (body.userId as DatabaseId) || (locals.user._id as DatabaseId),
        permissions: Array.isArray(body.permissions) ? body.permissions : [],
        scopes: Array.isArray(body.scopes) ? body.scopes : [],
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

    return rawResponse(event, {
      success: true,
      data: {
        ...scrubApiKey(createResult.data),
        key: full,
      },
      message: "Store this key securely — it will not be shown again.",
    });
  }

  if (request.method === "DELETE" && keyId) {
    const existing = await auth!.getApiKeyById(keyId as DatabaseId, dbOptions);
    if (!existing.success || !existing.data) {
      throw new AppError("API key not found", 404, "NOT_FOUND");
    }

    if (!userIsAdmin && existing.data.userId !== locals.user._id) {
      throw new AppError("Forbidden", 403, "FORBIDDEN");
    }

    const revokeResult = await auth!.revokeApiKey(keyId as DatabaseId, dbOptions);
    if (!revokeResult.success) {
      throw new AppError(revokeResult.message || "Failed to revoke API key", 500);
    }

    return rawResponse(event, { success: true, message: "API key revoked" });
  }

  throw new AppError("Method not allowed", 405, "METHOD_NOT_ALLOWED");
}
