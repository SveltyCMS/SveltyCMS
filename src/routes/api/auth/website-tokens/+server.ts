/**
 * @file src/routes/api/auth/website-tokens/+server.ts
 * @description Thin API wrapper for website tokens delegating to Local SDK.
 */

import { json } from "@sveltejs/kit";
import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";

export const GET = apiHandler(async ({ url, locals }) => {
  const { cms } = locals;
  if (!cms) throw new AppError("CMS not initialized", 500);

  const page = Number(url.searchParams.get("page") ?? 1);
  const limit = Number(url.searchParams.get("limit") ?? 10);
  const sort = url.searchParams.get("sort") ?? "createdAt";
  const order = url.searchParams.get("order") ?? "desc";

  const result = await cms.websiteTokens.list({ page, limit, sort, order });

  if (url.searchParams.get("raw") === "true") {
    return json(result.data);
  }
  return json({ data: result.data, pagination: { totalItems: result.total } });
});

export const POST = apiHandler(async ({ request, locals }) => {
  const { cms } = locals;
  if (!cms) throw new AppError("CMS not initialized", 500);

  const body = await request.json();
  const result = await cms.websiteTokens.create(body);

  return json(result, { status: 201 });
});

export const DELETE = apiHandler(async ({ url, locals }) => {
  const { cms } = locals;
  if (!cms) throw new AppError("CMS not initialized", 500);

  const id = url.searchParams.get("id");
  if (!id) throw new AppError("Token ID is required", 400);

  await cms.websiteTokens.delete(id);
  return new Response(null, { status: 204 });
});
