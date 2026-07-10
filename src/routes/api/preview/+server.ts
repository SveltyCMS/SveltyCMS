/**
 * @file src/routes/api/preview/+server.ts
 * @description Draft-mode handshake for live preview (sets cookies, redirects to target page).
 */

import { previewService } from "@src/services/content/preview-service";
import { error, redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url, cookies }) => {
  const previewToken = url.searchParams.get("preview_token") || url.searchParams.get("token");
  const slug = url.searchParams.get("slug") || "/";

  if (!previewToken) {
    throw error(400, "Missing preview_token");
  }

  const validated = previewService.validateToken(previewToken);
  if (!validated.valid) {
    throw error(401, "Invalid or expired preview token");
  }

  const isSecure = url.protocol === "https:";

  cookies.set("cms_draft_mode", "true", {
    path: "/",
    httpOnly: true,
    sameSite: isSecure ? "none" : "lax",
    secure: isSecure,
    maxAge: 60 * 60,
  });

  cookies.set("cms_preview_entry", validated.entryId, {
    path: "/",
    httpOnly: true,
    sameSite: isSecure ? "none" : "lax",
    secure: isSecure,
    maxAge: 60 * 60,
  });

  const target = slug.startsWith("/") ? slug : `/${slug}`;
  throw redirect(307, `${target}?preview_token=${encodeURIComponent(previewToken)}`);
};
