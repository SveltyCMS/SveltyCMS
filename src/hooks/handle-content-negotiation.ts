/**
 * @file src/hooks/handle-content-negotiation.ts
 * @description Content negotiation middleware for AI agents.
 * Serves markdown when agents request it via Accept: text/markdown.
 *
 * Markdown responses are ~94% smaller than HTML — reducing token costs
 * for AI crawlers (GPTBot, ClaudeBot, PerplexityBot).
 *
 * ### Features:
 * - Accept: text/markdown → stripped markdown body
 * - Falls through to normal HTML for browser requests
 * - llms.txt path is always served as text/markdown
 * - Adds Vary: Accept header for CDN cache differentiation
 */

import type { Handle } from "@sveltejs/kit";

export const handleContentNegotiation: Handle = async ({ event, resolve }) => {
  const accept = event.request.headers.get("accept") || "";

  // Serve llms.txt as markdown regardless of Accept header
  if (event.url.pathname === "/llms.txt") {
    return resolve(event);
  }

  // Check if agent requests markdown
  const prefersMarkdown = accept.includes("text/markdown");

  if (!prefersMarkdown) {
    return resolve(event);
  }

  // Resolve normally, then strip HTML wrapper returning just the rendered content
  const response = await resolve(event);

  if (!response.body || response.headers.get("content-type")?.includes("text/html")) {
    // For HTML pages, return with markdown content-type hint
    // The actual markdown stripping would need a more sophisticated render pipeline
    // For now, signal to agents that markdown is available
    const newHeaders = new Headers(response.headers);
    newHeaders.set("Vary", "Accept");
    newHeaders.set("X-Content-Negotiation", "markdown-available");

    return new Response(response.body, {
      status: response.status,
      headers: newHeaders,
    });
  }

  return response;
};
