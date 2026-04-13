/**
 * @file src/plugins/cookie-consent/index.ts
 * @description Cookie Consent Manager plugin for GDPR compliance.
 * Provides granular consent controls for analytics and marketing cookies.
 */

import type { Plugin } from "@src/plugins/types";

export const cookieConsentPlugin: Plugin = {
  metadata: {
    id: "cookie-consent",
    name: "Cookie Consent Manager",
    version: "1.1.0",
    description:
      "GDPR-compliant cookie banner with granular consent controls for analytics and marketing cookies.",
    icon: "mdi:cookie-cog",
    enabled: true,
    category: "compliance",
  },
  config: {
    public: {
      position: "bottom-left", // 'bottom' | 'bottom-left' | 'center'
      privacyPolicyUrl: "/privacy-policy",
      showCloseButton: false,
      delayMs: 800,
      theme: "system", // "light" | "dark" | "system"
    },
  },
};
