/**
 * @file src/routes/robots.txt/+server.ts
 * @description Dynamic robots.txt generator.
 */

import type { RequestHandler } from "@sveltejs/kit";

export const GET: RequestHandler = async ({ url }: { url: URL }) => {
  const baseUrl = `${url.protocol}//${url.host}`;

  const content = `User-agent: *
Allow: /

Sitemap: ${baseUrl}/sitemap.xml
`;

  return new Response(content, {
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "max-age=86400",
    },
  });
};
