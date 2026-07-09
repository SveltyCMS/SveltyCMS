/**
 * @file src/plugins/webmcp/init.ts
 * @description Initialization and registration logic for WebMCP tools — headless server gateway.
 *
 * Runs on both server and client; no longer blocks on typeof window check.
 * Server-side uses db adapter directly; client-side uses browser modelContext.
 */

import { logger } from "@utils/logger";
import { registerContentTools } from "./tools/content";
import { registerNavigationTools } from "./tools/navigation";
import { registerVirtualCollectionTools } from "./tools/virtual-collections";
import type { IDBAdapter } from "@src/databases/db-interface";

/**
 * Initializes the AI agent interface by registering available tools.
 *
 * @param db - Optional database adapter for server-side operation.
 *   When omitted, falls back to browser modelContext (client-side).
 */
export async function initWebMCP(db?: IDBAdapter): Promise<void> {
  logger.info("[WebMCP] Initializing AI agent interface (headless gateway)...");

  // Server-side: register tools directly with db adapter
  if (typeof window === "undefined") {
    try {
      if (db) {
        registerContentTools(db);
        registerNavigationTools(db);
        registerVirtualCollectionTools(db);
        logger.info("[WebMCP] Server-side AI tools registered with db adapter.");
      } else {
        logger.warn("[WebMCP] No db adapter provided for server-side registration.");
      }
    } catch (err) {
      logger.error("[WebMCP] Failed to register server-side tools", {
        error: err,
      });
    }
    return;
  }

  // Client-side: register tools with browser modelContext
  const docAny = window.document as any;
  if (!docAny?.modelContext) {
    logger.warn("[WebMCP] document.modelContext not available. AI bridge inactive.");
    return;
  }

  try {
    registerContentTools();
    registerNavigationTools();
    registerVirtualCollectionTools();
    logger.info("[WebMCP] Client-side AI tools registered successfully.");
  } catch (err) {
    logger.error("[WebMCP] Failed to register client tools", { error: err });
  }
}
