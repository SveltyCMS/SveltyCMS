/**
 * @file src/plugins/webmcp/index.ts
 * @description WebMCP (Model Context Protocol) plugin – enables secure AI agent interaction with the CMS.
 */

import type { Plugin } from "@src/plugins/types";

export { initWebMCP } from "./init";

export const webmcpPlugin: Plugin = {
  metadata: {
    id: "webmcp",
    name: "WebMCP – AI Agent Interface",
    version: "1.2.0",
    description:
      "Exposes controlled content management and navigation capabilities to browser-based AI agents via the Model Context Protocol (MCP).",
    icon: "mdi:robot",
    enabled: false, // Default to disabled – high risk feature
    category: "ai",
  },
  ui: {},
};
