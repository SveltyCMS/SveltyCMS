/**
 * @file src/plugins/sitemap/index.ts
 * @description Sitemap plugin definition — Agnostic Headless Sitemap Manager.
 *
 * Features:
 * - Automated XML sitemap with i18n/hreflang support
 * - Headless config: frontendDomain, autoInjectToRobotsTxt
 * - Search engine indexing pings
 */

import { definePlugin } from "../define-plugin";

export const sitemapPlugin = definePlugin({
  metadata: {
    id: "sitemap",
    name: "Agnostic Headless Sitemap Manager",
    version: "2.0.0",
    description: "Automated XML sitemap with i18n support and search engine indexing pings.",
    author: "SveltyCMS",
    icon: "mdi:sitemap",
    enabled: true,
    category: "seo",
  },
  config: {
    public: {
      pingBing: true,
      includeHreflang: true,
    },
    private: {
      frontendDomain: "",
      autoInjectToRobotsTxt: true,
    },
  },
});
