/**
 * @file src/hooks/handle-aeo-headers.ts
 * @description
 * AEO (Answer Engine Optimization) middleware.
 * Adds headers and metadata that help AI crawlers and answer engines
 * understand and cite content correctly.
 *
 * ### Features:
 * - Marks HTML responses with X-AEO-Enabled for answer engines
 * - Ensures exact `Vary: Accept` token for content negotiation / CDN correctness
 * - Clones response headers (immutable Response safety)
 */

import type { Handle } from "@sveltejs/kit/hooks";

export const handleAeoHeaders: Handle = async ({ event, resolve }) => {
  // AEO headers only apply to HTML pages — return JSON/API responses unchanged
  if (event.url.pathname.startsWith("/api/")) return resolve(event);

  const response = await resolve(event);

  // Skip the header-clone + Response re-wrap for non-HTML responses
  if (!response.headers.get("content-type")?.includes("text/html")) return response;

  const newHeaders = new Headers(response.headers);

  // Ensure Vary header includes the exact `Accept` token for content negotiation.
  // A substring check would wrongly match `Accept-Encoding` (and vice versa).
  const vary = newHeaders.get("Vary") || "";
  const varyTokens = vary
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  if (!varyTokens.includes("accept")) {
    newHeaders.set("Vary", vary ? `${vary}, Accept` : "Accept");
  }

  // Signal to answer engines that this content is well-structured
  newHeaders.set("X-AEO-Enabled", "true");

  return new Response(response.body, {
    status: response.status,
    headers: newHeaders,
  });
};
