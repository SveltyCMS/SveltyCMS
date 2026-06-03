/**
 * @file src/plugins/webmcp/init.ts
 * @description Initialization and registration logic for WebMCP tools.
 */

import { logger } from "@utils/logger";
import { registerContentTools } from "./tools/content";
import { registerNavigationTools } from "./tools/navigation";

/**
 * Initializes the AI agent interface by registering available tools with the browser's Model Context.
 */
export async function initWebMCP(): Promise<void> {
  if (typeof window === "undefined") return;

  logger.info("[WebMCP] Initializing AI agent interface...");

  const docAny = window.document as any;
  if (!docAny?.modelContext) {
    logger.warn("[WebMCP] document.modelContext not available. AI bridge inactive.");
    return;
  }

  try {
    registerContentTools();
    registerNavigationTools();
    logger.info("[WebMCP] All AI tools registered successfully.");
  } catch (err) {
    logger.error("[WebMCP] Failed to register tools", { error: err });
  }
}
