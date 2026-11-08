/**
 * @file src/content/context.ts
 * @description
 * Client-safe content context and hydration entry point.
 *
 * ### Features:
 * - Shared Svelte context key for the root and `(app)` layouts
 * - `setContentContext` / `useContent` tenant + version accessors
 * - `initializeContent` hydration bridge (store sync + live-sync bootstrap)
 *
 * 🛡️ Deliberately imports only the content registry store and the logger — no
 * facade, navigation, or tree module — so client routes that need the context
 * never pull the server-side navigation surface into their graph.
 */
import { getContext, setContext } from "svelte";
import { contentStore } from "@stores/content-registry.svelte";
import { logger } from "@utils/logger";
import type { ContentNode } from "./types";

const isBrowser = typeof window !== "undefined";

export const CONTENT_CONTEXT_KEY = Symbol("content-context");

export interface ContentContext {
  tenantId: string | null;
  version: number;
}

/** Hydration payload handed over by the root `+layout.server.ts`. */
export interface ContentHydrationData {
  contentNodes?: ContentNode[];
  tenantId?: string | null;
}

/**
 * Publishes the content context to the active component tree.
 * Fails soft outside active component initialization (e.g. async SSR / HMR).
 */
export function setContentContext(tenantId: string | null = null): ContentContext {
  const ctx = { tenantId, version: contentStore.contentVersion };
  try {
    setContext(CONTENT_CONTEXT_KEY, ctx);
  } catch {
    // Fails soft if called outside active component initialization (e.g. async SSR / HMR)
  }
  return ctx;
}

/** Reads the context published by `setContentContext` (undefined outside a provider). */
export function useContent(): ContentContext {
  return getContext<ContentContext>(CONTENT_CONTEXT_KEY);
}

/**
 * Initializes the modern content system from hydration data.
 *
 * In the browser this marks the store initialized and starts live sync; on the
 * server it warns instead, because boot-time initialization belongs to
 * `content/index.server.ts`.
 */
export async function initializeContent(pageData?: ContentHydrationData): Promise<void> {
  if (pageData?.contentNodes) {
    contentStore.sync(pageData.contentNodes);
  }
  if (isBrowser) {
    if (contentStore.initState === "uninitialized") {
      contentStore.initState = "initialized";
    }
    const { contentLiveSync } = await import("./content-sse.svelte");
    contentLiveSync.start();
  } else {
    logger.warn(
      "[contentSystem] initialize() called on server from client facade. Import from './index.server' instead.",
    );
  }
}
