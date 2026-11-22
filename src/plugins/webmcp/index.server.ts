/**
 * @file src/plugins/webmcp/index.server.ts
 * @description Server-side module for the WebMCP gateway (OAuth 2.1 routes).
 *
 * Loaded by the plugin server-module glob (`<plugin>/index.server.ts`) and merged
 * into the plugin definition when WebMCP is enabled — at boot or via lazy
 * activation. The MCP tool registry is untouched; this module only contributes
 * the client-credentials token lifecycle.
 *
 * ### Features:
 * - `POST /api/webmcp/oauth/token` — client-credentials token issuance
 * - `POST /api/webmcp/oauth/revoke` — client-owned token revocation
 * - both routes are `requiredCapabilities: "public"` (client-authenticated by
 *   HMAC-verified client credentials, license-gated inside the handler)
 *
 * ### Security:
 * - `webmcp` is not a core API namespace, so the catch-all dispatcher skips
 *   `ENDPOINT_PERMISSIONS` for these plugin routes and uses `requiredCapabilities`.
 *   A disabled plugin resolves no route → the namespace stays fail-closed (403).
 * - No other route in this plugin is public.
 */

import type { PluginPart, PluginServerModule } from "../types";
import { handleWebMcpRevokeRequest, handleWebMcpTokenRequest } from "./oauth-routes.server";

export const parts: PluginPart[] = [
  {
    type: "route",
    routes: [
      {
        path: "/api/webmcp/oauth/token",
        method: "POST",
        requiredCapabilities: "public",
        handler: handleWebMcpTokenRequest,
      },
      {
        path: "/api/webmcp/oauth/revoke",
        method: "POST",
        requiredCapabilities: "public",
        handler: handleWebMcpRevokeRequest,
      },
    ],
  },
];

const serverModule: PluginServerModule = { parts };

export default serverModule;
