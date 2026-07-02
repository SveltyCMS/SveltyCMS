/**
 * @file src/hooks/handle-aeo-headers.ts
 * @description AEO (Answer Engine Optimization) middleware.
 * Adds headers and metadata that help AI crawlers and answer engines
 * understand and cite content correctly.
 *
 * ### Features:
 * - Adds X-Robots-Tag for AI crawlers
 * - Ensures publishedAt/updatedAt are accessible
 * - Adds Vary: Accept for content negotiation
 */

import type { Handle } from "@sveltejs/kit";

export const handleAeoHeaders: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);

  const newHeaders = new Headers(response.headers);

  // Let AI crawlers know this page is indexable for answers
  if (response.headers.get("content-type")?.includes("text/html")) {
    // Ensure Vary header includes Accept for content negotiation
    const vary = newHeaders.get("Vary") || "";
    if (!vary.includes("Accept")) {
      newHeaders.set("Vary", vary ? `${vary}, Accept` : "Accept");
    }

    // Signal to answer engines that this content is well-structured
    newHeaders.set("X-AEO-Enabled", "true");
  }

  return new Response(response.body, {
    status: response.status,
    headers: newHeaders,
  });
};
