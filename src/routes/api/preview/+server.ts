/**
 * @file src/routes/api/preview/+server.ts
 * @description Draft-mode handshake for live preview (sets cookies, redirects to target page).
 */

// public-endpoint: authenticates with previewService.validateToken (signed, expiring token) — no session required

import { previewService } from "@src/services/content/preview-service";
import { redirect } from "@sveltejs/kit";
import { raise } from "@utils/error-handling";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url, cookies }) => {
  const previewToken = url.searchParams.get("preview_token") || url.searchParams.get("token");
  const slug = url.searchParams.get("slug") || "/";

  if (!previewToken) {
    raise(400, "Missing preview_token");
  }

  const validated = previewService.validateToken(previewToken, undefined, url.hostname);
  if (!validated.valid) {
    raise(401, "Invalid or expired preview token");
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

  // Store the HMAC-signed token so subsequent intra-frame navigations verify
  // cryptographic proof rather than trusting the unsigned cms_draft_mode flag.
  cookies.set("cms_preview_token", previewToken, {
    path: "/",
    httpOnly: true,
    sameSite: isSecure ? "none" : "lax",
    secure: isSecure,
    maxAge: 60 * 60,
  });

  // 🛡️ Only allow relative paths — block protocol-relative (//evil.com),
  // ASCII control chars (/\t/evil.com), and absolute URLs so a crafted slug
  // cannot turn this into an open redirect leaking preview_token.
  let hasControlChar = false;
  for (let i = 0; i < slug.length; i++) {
    const code = slug.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) {
      hasControlChar = true;
      break;
    }
  }
  if (
    hasControlChar ||
    slug.startsWith("//") ||
    slug.startsWith("http://") ||
    slug.startsWith("https://") ||
    slug.startsWith("/\\") ||
    slug.includes("\\")
  ) {
    raise(400, "Invalid preview target");
  }
  const target = slug.startsWith("/") ? slug : `/${slug}`;
  let resolvedTarget: URL;
  try {
    resolvedTarget = new URL(target, url.origin);
  } catch {
    raise(400, "Invalid preview target");
  }
  if (resolvedTarget.origin !== url.origin) {
    raise(400, "Invalid preview target");
  }
  throw redirect(307, `${target}?preview_token=${encodeURIComponent(previewToken)}`);
};
