/**
 * @file src/routes/api/[...path]/handlers/tokens.ts
 * @description API & Website token management handlers for the dispatcher.
 */

import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "../../cms";
import type { DatabaseId } from "@src/content/types";
import { successResponse, rawResponse } from "./base";

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
    const order = url.searchParams.get("order") ?? "desc";
    const result = await cms.websiteTokens.list({ tenantId, page, limit, sort, order });
    // Integration tests expect the result directly or in .data depending on raw flag
    return url.searchParams.get("raw") === "true"
      ? rawResponse(event, result.data)
      : rawResponse(event, result); // Use raw to match test expectations
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
    await cms.websiteTokens.delete(method, tenantId);
    return new Response(null, { status: 204 });
  }
}

export async function handleIdentityTokenRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  method: string,
  _segments: string[],
) {
  const { request, url, locals } = event;

  if (request.method === "GET") {
    const tokenId = method;
    if (!tokenId || tokenId === "list") {
      const result = await cms.auth.tokens.list({
        tenantId,
        search: url.searchParams.get("search") || undefined,
        page: Number(url.searchParams.get("page")) || 1,
        limit: Number(url.searchParams.get("limit")) || 10,
        sort: url.searchParams.get("sort") || undefined,
        order: (url.searchParams.get("order") as "asc" | "desc") || "desc",
      });
      return url.searchParams.get("raw") === "true"
        ? rawResponse(event, result.data)
        : rawResponse(event, result);
    }
    return rawResponse(event, await cms.auth.tokens.findById(tokenId, tenantId));
  }

  if ((request.method === "PATCH" || request.method === "PUT") && method) {
    const body = await request.json();
    return rawResponse(event, await cms.auth.tokens.update(method, body, tenantId));
  }

  if (request.method === "POST") {
    const body = await request.json();
    if (method === "create-token") {
      if (body.expiresIn && !body.expires) body.expires = body.expiresIn;
      const tokenValue = await cms.auth.tokens.create({ ...body, tenantId });
      return rawResponse(
        event,
        { success: true, token: { value: tokenValue, token: tokenValue } },
        201,
      );
    }
    if (method === "batch") {
      const { tokenIds, action } = body;
      const batchAction = action || body.batchAction;
      if (!Array.isArray(tokenIds)) throw new AppError("tokenIds must be an array", 400);
      return rawResponse(event, await cms.auth.tokens.batchAction(tokenIds, batchAction, tenantId));
    }
    if (method === "resolve") {
      const locale = (locals as any).locale || "en";
      return rawResponse(event, {
        resolved: await cms.auth.tokens.resolve(body.text, locals.user, tenantId, locale),
      });
    }
  }

  if (request.method === "DELETE" && method) {
    await cms.auth.tokens.delete(method, tenantId);
    return rawResponse(event, { success: true });
  }
}
