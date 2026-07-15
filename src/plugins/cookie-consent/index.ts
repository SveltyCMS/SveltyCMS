/**
 * @file src/plugins/cookie-consent/index.ts
 * @description Cookie Consent Manager plugin for GDPR compliance — headless + server-aware.
 *
 * Features:
 * - GDPR-compliant cookie banner with granular consent controls
 * - Server-side consent logging for audit trails
 * - Geo-IP filtering for jurisdiction-aware display
 * - Allowed origins for cross-origin headless frontends
 */

import { definePlugin } from "../define-plugin";

export const cookieConsentPlugin = definePlugin({
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
    private: {
      allowedOrigins: [],
      persistConsentLog: true,
      geoIpFiltering: false,
    },
  },
});
