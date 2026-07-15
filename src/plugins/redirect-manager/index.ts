/**
 * @file src/plugins/redirect-manager/index.ts
 * @description Headless Redirect Router — enterprise-grade redirect manager for SveltyCMS.
 *
 * Features:
 * - Auto-slug tracking with 301 redirect generation
 * - Edge KV sync for headless frontends
 * - Fail-closed semantics on cache miss
 * - Multi-tenant support
 */

import { definePlugin } from "../define-plugin";

export const redirectManagerPlugin = definePlugin({
  metadata: {
    id: "redirect-manager",
    name: "Headless Redirect Router",
    version: "2.0.0",
    description:
      "Enterprise-grade redirect manager with auto-slug tracking, edge KV sync, and multi-tenant support for headless frontends.",
    author: "SveltyCMS",
    icon: "mdi:directions-fork",
    enabled: true,
    category: "seo",
  },
  ui: {
    actions: [
      {
        id: "manage_redirects",
        label: "Manage Redirects",
        icon: "mdi:link-variant",
        handler: "openRedirectManager",
      },
    ],
  },
  config: {
    public: {
      autoRedirectOnSlugChange: true,
      trailingSlash: "ignore", // 'ignore', 'add', 'remove'
      forceLowercase: true,
    },
    private: {
      frontendBaseUrl: "",
      syncToEdgeOnPublish: false,
      failClosedOnCacheMiss: true,
    },
  },
});
