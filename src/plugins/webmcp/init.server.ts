/**
 * @file src/plugins/webmcp/init.server.ts
 * @description Server-side WebMCP bootstrap (headless gateway).
 *
 * Server-only counterpart of `init.ts`. Importing this from client code would pull
 * `*.server.ts` services and Node builtins into the browser bundle, which
 * SvelteKit's server-module guard rejects — register it from a server-only entry
 * point (or a test) only.
 *
 * ### Features:
 * - Registers content/navigation/virtual-collection tools with the db adapter
 * - Registers the headless builder tools (`registerBuilderServerTools`)
 */

import { logger } from "@utils/logger";
import type { IDBAdapter } from "@src/databases/db-interface";
import { registerContentTools } from "./tools/content";
import { registerNavigationTools } from "./tools/navigation";
import { registerVirtualCollectionTools } from "./tools/virtual-collections";
import { registerBuilderServerTools } from "./tools/builder.server";

/**
 * Register the headless AI tools.
 *
 * @param db - Database adapter for server-side tool operation.
 */
export async function initWebMCPServer(db?: IDBAdapter): Promise<void> {
  logger.info("[WebMCP] Initializing AI agent interface (headless gateway)...");
  try {
    if (!db) {
      logger.warn("[WebMCP] No db adapter provided for server-side registration.");
      return;
    }
    registerContentTools(db);
    registerNavigationTools(db);
    registerVirtualCollectionTools(db);
    registerBuilderServerTools();
    logger.info("[WebMCP] Server-side AI tools registered with db adapter.");
  } catch (err) {
    logger.error("[WebMCP] Failed to register server-side tools", { error: err });
  }
}
