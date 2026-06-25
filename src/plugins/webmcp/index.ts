/**
 * @file src/plugins/webmcp/index.ts
 * @description Headless WebMCP Server Gateway — enables secure AI agent interaction with the CMS.
 *
 * Features:
 * - Headless server gateway (not client-only)
 * - Configurable transport mode (SSE/stdio)
 * - Remote agent support with API key auth
 * - Token limit enforcement
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
};
