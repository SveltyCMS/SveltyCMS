/**
 * @file src/plugins/pagespeed/index.ts
 * @description Google PageSpeed Insights integration for performance monitoring.
 */

import type { Plugin } from "../types";

export const pageSpeedPlugin: Plugin = {
  metadata: {
    id: "pagespeed",
    name: "Google PageSpeed Insights",
    version: "1.1.0",
    description:
      "Monitors Core Web Vitals and performance scores using Google PageSpeed Insights API with caching.",
    author: "SveltyCMS",
    icon: "mdi:speedometer",
    enabled: false,
    category: "performance",
  },
  // migrations and ssrHook handled via index.server.ts and dynamic resolution in registry
  ui: {
    columns: [
      {
        id: "performance_score",
        label: "Performance",
        width: "110px",
        sortable: false,
        component: "score",
        props: {
          score: "performanceScore",
          fcp: "fcp",
          lcp: "lcp",
          cls: "cls",
          fetchedAt: "fetchedAt",
        },
      },
    ],
    actions: [
      {
        id: "refresh_pagespeed",
        label: "Refresh PageSpeed",
        icon: "mdi:refresh",
        handler: "refreshPageSpeed",
        confirm: "This will call Google API and may consume your quota. Continue?",
      },
    ],
  },
  config: {
    public: {
      defaultDevice: "mobile",
    },
    private: {
      apiKeySource: "settings",
    },
  },
  enabledCollections: [],
};
