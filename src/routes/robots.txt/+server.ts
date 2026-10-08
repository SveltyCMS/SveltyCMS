/**
 * @file src/routes/robots.txt/+server.ts
 * @description Dynamic robots.txt generator. AI-crawler directives follow the
 * `AI_CRAWLER_POLICY` public setting ("allow" default, "block-training",
 * "block-all") — search crawlers are never affected by them.
 */

import type { RequestHandler } from "@sveltejs/kit";
import { getPublicSettingSync } from "@src/services/core/settings-service";
import { buildRobotsTxt, type AiCrawlerPolicy } from "@src/services/content/seo/sitemap-builder";

export const GET: RequestHandler = async ({ url }) => {
  const baseUrl = `${url.protocol}//${url.host}`;
  const policy = getPublicSettingSync("AI_CRAWLER_POLICY") ?? "allow";

  const content = buildRobotsTxt(`${baseUrl}/sitemap.xml`, policy as AiCrawlerPolicy);

  return new Response(content, {
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "max-age=86400",
    },
  });
};
