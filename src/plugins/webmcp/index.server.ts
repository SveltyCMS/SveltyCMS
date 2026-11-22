/**
 * @file src/plugins/webmcp/index.server.ts
 * @description Server-side module for the WebMCP gateway (OAuth 2.1 + MCP routes).
 *
 * Loaded by the plugin server-module glob (`<plugin>/index.server.ts`) and merged
 * into the plugin definition when WebMCP is enabled — at boot or via lazy
 * activation. Contributes the client-credentials token lifecycle and the
 * stateless MCP JSON-RPC transport; the tool registry stays untouched.
 *
 * ### Features:
 * - `POST /api/webmcp/oauth/token` — client-credentials token issuance
 * - `POST /api/webmcp/oauth/revoke` — client-owned token revocation
 * - `POST /api/webmcp/mcp` — stateless MCP JSON-RPC transport (bearer-authenticated,
 *   scope-enforced, tenant from the token)
 * - all routes are `requiredCapabilities: "public"` (the OAuth routes verify
 *   client credentials; the MCP route authenticates the bearer token itself;
 *   every handler runs the license gate first)
 *
 * ### Security:
 * - `webmcp` is not a core API namespace, so the catch-all dispatcher skips
 *   `ENDPOINT_PERMISSIONS` for these plugin routes and uses `requiredCapabilities`.
 *   A disabled plugin resolves no route → the namespace stays fail-closed (403).
 * - No route in this plugin relies on the session cookie; every entry point
 *   authenticates its own credential.
 */

import type { PluginPart, PluginServerModule } from "../types";
import { handleWebMcpMcpRequest } from "./mcp-routes.server";
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
      {
        path: "/api/webmcp/mcp",
        method: "POST",
        requiredCapabilities: "public",
        handler: handleWebMcpMcpRequest,
      },
    ],
  },
];

const serverModule: PluginServerModule = { parts };

export default serverModule;
