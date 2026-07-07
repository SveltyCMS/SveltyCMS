/**
 * @file src/plugins/webmcp/index.ts
 * @description Headless WebMCP Server Gateway — enables secure AI agent interaction with the CMS.
 *
 * Features:
 * - Headless server gateway (not client-only)
 * - Configurable transport mode (SSE/stdio)
 * - Remote agent support with API key auth
 * - Token limit enforcement
 *
 * ### Licensing:
 * - Fully paid (€29.99) — no free tier
 * - All operations blocked without an active license
 */

import type { Plugin } from "@src/plugins/types";

export { initWebMCP } from "./init";

export const webmcpPlugin: Plugin = {
  metadata: {
    id: "webmcp",
    name: "Headless WebMCP Server Gateway",
    version: "2.0.0",
    description:
      "Exposes controlled content management and navigation capabilities to remote AI agents via the Model Context Protocol (MCP) as a headless server gateway.",
    icon: "mdi:robot",
    enabled: false,
    category: "ai",
  },
  config: {
    public: {
      transportMode: "sse", // "sse" | "stdio"
      allowRemoteAgents: false,
      maxPayloadTokenLimit: 4096,
    },
    private: {
      agentApiKey: "",
    },
  },
  ui: {},
  hooks: {
    beforeSave: async (context, _collection, data) => {
      const { checkExtensionLicense } = await import("@src/utils/license-manager");
      const status = await checkExtensionLicense("plugin", "webmcp");
      if (!status.active) {
        throw new Error(
          "403 Forbidden: Active license required for WebMCP Server Gateway. Purchase at marketplace.sveltycms.com",
        );
      }
      return data;
    },
  },
};
