/**
 * @file src/routes/api/[...path]/handlers/tokens.ts
 * @description API & Website token management handlers for the dispatcher.
 */

import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import { json } from "@sveltejs/kit";
import type { LocalCMS } from "../../cms";
import type { DatabaseId } from "@src/content/types";
import { successResponse, rawResponse } from "./base";
import crypto from "node:crypto";
import { withTenant } from "@src/databases/db-adapter-wrapper";

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

      const result = await withTenant(
        tenantId,
        async () => {
          return await cms.db.system.websiteTokens.getAll({
            limit,
            skip: (page - 1) * limit,
            sort,
            order,
          });
        },
        { collection: "websiteTokens" },
      );

      if (!result.success) throw new AppError(result.message, 500);

      if (url.searchParams.get("raw") === "true") return json(result.data.data);
      return json({ data: result.data.data, pagination: { totalItems: result.data.total } });
    }

    if (request.method === "POST") {
      const { name, permissions, expiresAt } = await request.json();
      const result = await withTenant(
        tenantId,
        async () => {
          const token = `sv_${crypto.randomBytes(24).toString("hex")}`;
          return await cms.db.system.websiteTokens.create({
            name,
            token,
            updatedAt: new Date().toISOString() as any,
            createdBy: user!._id,
            permissions: permissions || [],
            expiresAt: (expiresAt || undefined) as any,
          });
        },
        { collection: "websiteTokens" },
      );
      if (!result.success) throw new AppError(result.message, 500);
      return json(result.data, { status: 201 });
    }

    if (request.method === "DELETE" && method) {
      await withTenant(
        tenantId,
        async () => {
          return await cms.db.system.websiteTokens.delete(method as any);
        },
        { collection: "websiteTokens" },
      );
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
        return url.searchParams.get("raw") === "true"
          ? rawResponse(result.data)
          : successResponse(result);
      }
      return rawResponse(await cms.auth.tokens.findById(tokenId, tenantId));
    }

    if (request.method === "PATCH" && method) {
      const data = await request.json();
      return rawResponse(await cms.auth.tokens.update(method, data, tenantId));
    }

    if (request.method === "POST") {
      const body = await request.json();
      if (method === "create-token") {
        if (body.expiresIn && !body.expires) body.expires = body.expiresIn;
        const result = await cms.auth.tokens.create({ ...body, tenantId });
        return result.success ? successResponse({ token: result.data }) : rawResponse(result, 400);
      }
      if (method === "batch") {
        return rawResponse(await cms.auth.tokens.batchAction(body.tokenIds, body.action, tenantId));
      }
      if (method === "resolve") {
        const locale = (locals as any).locale || "en";
        const resolved = await cms.auth.tokens.resolve(body.text, user, tenantId, locale);
        return json({ resolved });
      }
    }

    if (request.method === "DELETE" && method) {
      return rawResponse(await cms.auth.tokens.delete(method, tenantId));
    }
  }

  throw new AppError(`Token endpoint /api/${segments.join("/")} not implemented`, 404);
}
