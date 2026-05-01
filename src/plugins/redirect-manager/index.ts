/**
 * @file src/plugins/redirect-manager/index.ts
 * @description High-performance redirect manager for SveltyCMS.
 */

import type { Plugin } from "../types";

export const redirectManagerPlugin: Plugin = {
  metadata: {
    id: "redirect-manager",
    name: "Redirect Manager",
    version: "1.0.0",
    description:
      "Enterprise-grade redirect manager with auto-slug tracking and multi-tenant support.",
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
  },
};
