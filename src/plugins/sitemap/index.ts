/**
 * @file src/plugins/sitemap/index.ts
 * @description Sitemap plugin definition.
 */

import type { Plugin } from "../types";

export const sitemapPlugin: Plugin = {
  metadata: {
    id: "sitemap",
    name: "Dynamic Sitemap & Indexing",
    version: "1.0.0",
    description: "Automated XML sitemap with i18n support and search engine indexing pings.",
    author: "SveltyCMS",
    icon: "mdi:sitemap",
    enabled: true,
    category: "seo",
  },
  config: {
    public: {
      pingGoogle: true,
      pingBing: true,
      includeHreflang: true,
    },
  },
};
