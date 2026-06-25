/**
 * @file src/hooks/handle-security-headers.ts
 * @description Hardened security headers middleware with OPTIONS preflight support and safe header mutation.
 */

import type { Handle } from "@sveltejs/kit";
import { dev } from "$app/environment";
import { getCorsHeaders } from "@utils/security/cors-utils";
import { API_CONTENT_SECURITY_POLICY } from "@src/utils/security-constants";
import { applySecurityHeaders, STATIC_ASSET_REGEX } from "@utils/hook-utils";

const PERMISSIONS_POLICY = [
  "geolocation=()",
  "microphone=()",
  "camera=()",
  "display-capture=()",
  "clipboard-read=()",
  "clipboard-write=(self)",
  "web-share=(self)",
].join(", ");

export function applyAllSecurityHeaders(
  headers: Headers,
  isHttps: boolean,
  origin: string | null,
  pathname: string,
) {
  const isPageRoute = !pathname.startsWith("/api/");
  const svelteKitCsp = isPageRoute ? headers.get("Content-Security-Policy") : null;

  applySecurityHeaders(headers, isHttps && !dev);

  headers.set("X-XSS-Protection", "1; mode=block");
  headers.set("X-DNS-Prefetch-Control", "off");
  headers.set("X-Permitted-Cross-Domain-Policies", "none");
  headers.set("Permissions-Policy", PERMISSIONS_POLICY);

  // Cross-Origin Isolation: use credentialless for media routes to avoid third-party asset breakage
  if (pathname.startsWith("/api/")) {
    headers.set("Cross-Origin-Opener-Policy", "same-origin");
    if (pathname.startsWith("/api/media/") || pathname.includes("/mediagallery")) {
      headers.set("Cross-Origin-Embedder-Policy", "credentialless");
    } else {
      headers.set("Cross-Origin-Embedder-Policy", "require-corp");
    }
    headers.set("Cross-Origin-Resource-Policy", "same-origin");
  }

  if (pathname.startsWith("/api/")) {
    const corsHeaders = getCorsHeaders(origin, true);
    if (corsHeaders) {
      for (const [key, value] of Object.entries(corsHeaders)) {
        headers.set(key, value as string);
      }
    }
    headers.append("Vary", "Origin");
  }

  if (pathname.startsWith("/api/graphql")) {
    const isProduction = process.env.NODE_ENV === "production";
    const allowPlayground = !isProduction && process.env.ALLOW_GRAPHQL_PLAYGROUND !== "false";
    if (allowPlayground) {
      headers.set(
        "Content-Security-Policy",
        [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com",
          "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com https://fonts.googleapis.com",
          "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net",
          "img-src 'self' data: blob: https://cdn.jsdelivr.net",
          "connect-src 'self' https://cdn.jsdelivr.net",
          "frame-src 'none'",
        ].join("; "),
      );
      headers.set("Cross-Origin-Embedder-Policy", "unsafe-none");
    } else {
      headers.set(
        "Content-Security-Policy",
        [
          "default-src 'self'",
          "script-src 'self'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "font-src 'self'",
          "connect-src 'self'",
          "frame-src 'none'",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join("; "),
      );
    }
  } else if (pathname.startsWith("/api/")) {
    headers.set("Content-Security-Policy", API_CONTENT_SECURITY_POLICY);
  } else if (svelteKitCsp) {
    headers.set("Content-Security-Policy", svelteKitCsp);
  }
}

export const handleSecurityHeaders: Handle = async ({ event, resolve }) => {
  const { url, request } = event;
  const pathname = url.pathname;

  if (STATIC_ASSET_REGEX.test(pathname)) return await resolve(event);

  // Preflight OPTIONS short-circuit with full CORS + security headers
  if (request.method === "OPTIONS" && pathname.startsWith("/api/")) {
    const headers = new Headers();
    applyAllSecurityHeaders(
      headers,
      url.protocol === "https:",
      request.headers.get("Origin"),
      pathname,
    );
    return new Response(null, { status: 204, headers });
  }

  const response = await resolve(event);

  // Clone into mutable headers to prevent frozen-object crashes
  const mutableHeaders = new Headers(response.headers);
  applyAllSecurityHeaders(
    mutableHeaders,
    url.protocol === "https:",
    request.headers.get("Origin"),
    pathname,
  );

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: mutableHeaders,
  });
};
