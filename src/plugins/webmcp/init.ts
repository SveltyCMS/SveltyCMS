/**
 * @file src/plugins/webmcp/init.ts
 * @description Client-side WebMCP bootstrap (browser `document.modelContext` bridge).
 *
 * Imported by `+layout.svelte`, so this module lives in the CLIENT graph and must
 * stay free of server-only imports. Headless/server registration lives in
 * `init.server.ts` (never imported from client code).
 *
 * ### Features:
 * - Registers the client-safe content/navigation/virtual-collection/builder tools
 * - No-ops cleanly when `document.modelContext` is unavailable
 */

import { logger } from "@utils/logger";
import { registerContentTools } from "./tools/content";
import { registerNavigationTools } from "./tools/navigation";
import { registerVirtualCollectionTools } from "./tools/virtual-collections";
import { registerBuilderTools } from "./tools/builder";

/** Register the browser-side AI tools with `document.modelContext`. */
export async function initWebMCP(): Promise<void> {
  logger.info("[WebMCP] Initializing AI agent interface (browser bridge)...");

  if (typeof window === "undefined") return;

  const docAny = window.document as unknown as { modelContext?: unknown };
  if (!docAny?.modelContext) {
    logger.warn("[WebMCP] document.modelContext not available. AI bridge inactive.");
    return;
  }

  try {
    registerContentTools();
    registerNavigationTools();
    registerVirtualCollectionTools();
    registerBuilderTools();
    logger.info("[WebMCP] Client-side AI tools registered successfully.");
  } catch (err) {
    logger.error("[WebMCP] Failed to register client tools", { error: err });
  }
}
