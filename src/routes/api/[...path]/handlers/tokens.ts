/**
 * @file src/routes/api/[...path]/handlers/tokens.ts
 * @description API & Website token management handlers for the dispatcher.
 */

import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import { json } from "@sveltejs/kit";
import type { LocalCMS } from "../../cms";
import type { DatabaseId } from "@src/content/types";
import { rawResponse, successResponse } from "./base";

export async function handleTokenRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  namespace: string,
  segments: string[],
) {
  const { request, url, locals } = event;
  const { user } = locals;
  const method = segments[1];

  // --- Website Tokens (Special Wrapper Logic) ---
  if (namespace === "website-tokens") {
    if (request.method === "GET") {
      const page = Number(url.searchParams.get("page") ?? 1);
      const limit = Number(url.searchParams.get("limit") ?? 10);
      const sort = url.searchParams.get("sort") ?? "createdAt";
      const order = url.searchParams.get("order") ?? "desc";

      const result = await cms.websiteTokens.list({
        tenantId,
        page,
        limit,
        sort,
        order,
      });

      if (url.searchParams.get("raw") === "true") return rawResponse(event, result.data);
      return successResponse(event, result);
    }

    if (request.method === "POST") {
      const body = await request.json();
      const result = await cms.websiteTokens.create({
        ...body,
        user,
        tenantId,
      });
      return rawResponse(event, result, 201);
    }

    if (request.method === "DELETE" && method) {
      await cms.websiteTokens.delete(method, tenantId);
      return new Response(null, { status: 204 });
    }
  }

  // --- API / Identity Tokens ---
  if (namespace === "token") {
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

        if (url.searchParams.get("raw") === "true") return rawResponse(event, result.data);
        return successResponse(event, result);
      }
      const result = await cms.auth.tokens.findById(tokenId, tenantId);
      return rawResponse(event, result);
    }

    if ((request.method === "PATCH" || request.method === "PUT") && method) {
      const data = await request.json();
      const result = await cms.auth.tokens.update(method, data, tenantId);
      return rawResponse(event, result);
    }

    if (request.method === "POST") {
      const body = await request.json();
      if (method === "create-token") {
        if (body.expiresIn && !body.expires) body.expires = body.expiresIn;
        const tokenValue = await cms.auth.tokens.create({ ...body, tenantId });

        return rawResponse(
          event,
          {
            success: true,
            token: {
              value: tokenValue,
              token: tokenValue,
            },
          },
          201,
        );
      }
      if (method === "batch") {
        const { tokenIds, action: batchAction } = body;
        if (!Array.isArray(tokenIds)) throw new AppError("tokenIds must be an array", 400);

        const result = await cms.auth.tokens.batchAction(tokenIds, batchAction, tenantId);
        return rawResponse(event, result);
      }
      if (method === "resolve") {
        const locale = (locals as any).locale || "en";
        const resolved = await cms.auth.tokens.resolve(body.text, user, tenantId, locale);
        return json({ resolved });
      }
    }

    if (request.method === "DELETE" && method) {
      const result = await cms.auth.tokens.delete(method, tenantId);
      return rawResponse(event, result);
    }
  }

  throw new AppError(`Token endpoint /api/${segments.join("/")} not implemented`, 404);
}
