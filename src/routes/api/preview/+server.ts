/**
 * @file src/routes/api/preview/+server.ts
 * @description Enhanced live preview handshake endpoint supporting Signed Tokens.
 */

import { getPrivateSettingSync } from "@src/services/settings-service";
import { previewService } from "@src/services/preview-service";
import { json, redirect } from "@sveltejs/kit";
import { logger } from "@utils/logger.server";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url, cookies }) => {
  const secret = url.searchParams.get("secret");
  const token = url.searchParams.get("preview_token");
  const slug = url.searchParams.get("slug");

  let isAuthorized = false;

  // 1. Validate via Signed Token (Primary / Modern)
  if (token) {
    const validation = previewService.validateToken(token);
    if (validation.valid) {
      isAuthorized = true;
      logger.debug(`Preview authorized via token for user: ${validation.userId}`);
    }
  }

  // 2. Fallback to Legacy Static Secret
  if (!isAuthorized && secret) {
    const storedSecret = getPrivateSettingSync("PREVIEW_SECRET");
    if (storedSecret && secret === storedSecret) {
      isAuthorized = true;
      logger.debug("Preview authorized via legacy static secret");
    }
  }

  if (!isAuthorized) {
    logger.warn("Preview handshake failed: invalid token or secret");
    return json({ error: "Unauthorized preview request" }, { status: 401 });
  }

  // 3. Set secure draft mode cookie
  cookies.set("cms_draft_mode", "1", {
    path: "/",
    httpOnly: true,
    secure: true, // Required for SameSite=None
    sameSite: "none", // Critical for cross-domain iframes
    maxAge: 60 * 60, // 1 hour session
  });

  // 4. Redirect to the target slug
  if (slug) {
    throw redirect(307, slug);
  }

  return json({
    success: true,
    message: "Draft mode enabled",
    authorized_via: token ? "token" : "secret",
  });
};
