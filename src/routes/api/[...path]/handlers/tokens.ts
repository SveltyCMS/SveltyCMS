/**
 * @file src/routes/api/[...path]/handlers/tokens.ts
 * @description API & Website token management handlers for the dispatcher.
 */

import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
// Removed unused json import
import type { LocalCMS } from "../../cms";
import type { DatabaseId } from "@src/content/types";
import { rawResponse, successResponse } from "./base";

export async function handleTokenRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const { locals } = event;
  const { user: _user } = locals;
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
  const { user: _user } = locals;

  if (request.method === "GET") {
    const page = Number(url.searchParams.get("page") ?? 1);
    const limit = Number(url.searchParams.get("limit") ?? 10);
    const sort = url.searchParams.get("sort") ?? "createdAt";
    const order = url.searchParams.get("order") ?? "desc";
    const result = await cms.websiteTokens.list({ tenantId, page, limit, sort, order });
    return url.searchParams.get("raw") === "true"
      ? rawResponse(event, result.data)
      : successResponse(event, result);
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
  const { user: _user } = locals;

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
        : successResponse(event, result);
    }
    return rawResponse(event, await cms.auth.tokens.findById(tokenId, tenantId));
  }

  if ((request.method === "PATCH" || request.method === "PUT") && method) {
    return rawResponse(event, await cms.auth.tokens.update(method, await request.json(), tenantId));
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
      if (!Array.isArray(body.tokenIds)) throw new AppError("tokenIds must be an array", 400);
      return rawResponse(
        event,
        await cms.auth.tokens.batchAction(body.tokenIds, body.batchAction, tenantId),
      );
    }
    if (method === "resolve") {
      const locale = (locals as any).locale || "en";
      return Response.json({
        resolved: await cms.auth.tokens.resolve(body.text, locals.user, tenantId, locale),
      });
    }
  }

  if (request.method === "DELETE" && method) {
    await cms.auth.tokens.delete(method, tenantId);
    return rawResponse(event, { success: true });
  }
}
