/**
 * @file src/content/index.ts
 * @description Single Entry Point and Public API Facade for the SveltyCMS Content System (Browser-safe).
 * 🛡️ SECURITY: This file MUST remain browser-safe. No server-only imports allowed.
 */

import { browser as isBrowser } from "$app/environment";
import { contentStore } from "@stores/content-store.svelte";
import { contentSystemBase } from "./core";

// --- RE-EXPORTS ---
export * from "./types";
export { contentStore } from "@stores/content-store.svelte";
export {
  contentNavigation,
  contentMetrics,
  sortContentNodes,
  generateCategoryNodesFromPaths,
  hasDuplicateSiblingName,
} from "./content-utils";

export type { DatabaseAdapter } from "@src/databases/db-interface"; // Only types

// ===================================================================
// BROWSER-SAFE CONTENT SYSTEM
// ===================================================================
export const contentSystem = {
  ...contentSystemBase,

  // --- Lifecycle ---
  async initialize(tenantId: string | null = null, force = false, adapter?: any): Promise<void> {
    if (isBrowser) {
      if (contentStore.initState === "uninitialized") {
        contentStore.initState = "initialized";
      }
      const { contentLiveSync } = await import("./content-sse.svelte");
      contentLiveSync.start();
    } else {
      // Server-side delegation to index.server.ts
      const { contentSystem: serverSystem } = await import("./index.server");
      return serverSystem.initialize(tenantId, force, adapter);
    }
  },

  async refresh(
    _tenantId?: string | null,
    _skipReconciliation?: boolean,
    _incremental = false,
  ): Promise<void> {
    // No-op on browser — real refresh happens via SSE or server actions
    if (!isBrowser) {
      console.warn("[contentSystem] refresh() called on server from wrong entry point");
    }
  },

  async generateApiSpec(_tenantId: string = "global", _force = false) {
    return null; // Server-only
  },

  // --- CRUD (Server-only) ---
  async find(..._args: any[]) {
    throw new Error(
      "contentSystem.find() is server-only. Use contentSystem.server.find() instead.",
    );
  },
  async findOne(..._args: any[]) {
    throw new Error("Server-only operation");
  },
  async insert(..._args: any[]) {
    throw new Error("Server-only operation");
  },
  async update(..._args: any[]) {
    throw new Error("Server-only operation");
  },
  async delete(..._args: any[]) {
    throw new Error("Server-only operation");
  },

  // --- Node Operations ---
  async getContentStructureFromDatabase() {
    return [];
  },
  async reorderContentNodes(_items: any[], tenantId?: string | null) {
    if (isBrowser) return contentStore.getNodesForTenant(tenantId);
    return [];
  },
  async upsertContentNodes() {},
  async search() {
    return { success: true, data: [] };
  },
  async scanForCollections() {
    return [];
  },

  // Optional: Explicit server namespace for clarity
  server: {
    find: () => {
      throw new Error(
        "Use the server import: import { contentSystem } from '@/content/index.server'",
      );
    },
    // ... other server methods
  },
};

// --- Backward Compatibility ---
export const setContentContext = (tenantId: string | null = null) =>
  contentSystem.setContext(tenantId);

export const useContent = () => contentSystem.getContext();

export async function initializeContent(pageData?: any) {
  if (pageData?.contentNodes) {
    contentStore.sync(pageData.contentNodes);
  }
  await contentSystem.initialize(pageData?.tenantId ?? null);
}
