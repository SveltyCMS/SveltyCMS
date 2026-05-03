/**
 * @file src/utils/navigation.ts
 * @description Unified navigation system for SveltyCMS.
 *
 * Consolidates:
 * - NavigationManager (locking, mode transitions, loading state)
 * - Navigation Utilities (preloading, URL parsing, reflection)
 * - Slugify (URL-safe identifier generation)
 */

import { goto, preloadData } from "$app/navigation";
import { page } from "$app/state";
import { setCollectionValue, type ModeType } from "@src/stores/collection-store.svelte";
import { globalLoadingStore, loadingOperations } from "@src/stores/loading-store.svelte.ts";
import { uiModeStore } from "@stores/ui-mode-store.svelte";
import { dataChangeStore } from "@src/stores/store.svelte.ts";
import { logger } from "./logger";

const IS_BROWSER = typeof window !== "undefined";

// --- Types ---

export interface ParsedURL {
  collectionPath: string;
  entryId?: string;
  language: string;
  mode: ModeType;
}

export interface SlugifyOptions {
  replacement?: string;
  remove?: RegExp;
  lower?: boolean;
  strict?: boolean;
  trim?: boolean;
}

// --- Slugification (Merged from slugify.ts) ---

/**
 * Converts a string into a URL-safe slug.
 */
export function slugify(string: string, options: SlugifyOptions = {}): string {
  if (typeof string !== "string") return "";

  const replacement = options.replacement ?? "-";
  const lower = options.lower ?? true;
  const strict = options.strict ?? true;
  const trim = options.trim ?? true;

  let slug = string.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (options.remove) slug = slug.replace(options.remove, "");
  if (lower) slug = slug.toLowerCase();

  slug = slug.replace(/[_.\s]+/g, replacement);
  if (strict) {
    const safeReplacement = replacement.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const strictRegex = new RegExp(`[^a-z0-9${safeReplacement}]`, "gi");
    slug = slug.replace(strictRegex, "");
  }

  const multiReplaceRegex = new RegExp(
    `(${replacement.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}){2,}`,
    "g",
  );
  slug = slug.replace(multiReplaceRegex, replacement);

  if (trim) {
    if (slug.startsWith(replacement)) slug = slug.slice(replacement.length);
    if (slug.endsWith(replacement)) slug = slug.slice(0, -replacement.length);
  }

  return slug;
}

// --- Navigation Utilities (Merged from navigation-utils.ts) ---

const preloadTimers = new Map<string, number>();

/**
 * Preloads entry data with a delay to prevent aggressive prefetching.
 */
export function preloadEntry(entryId: string, currentPath: string, delay = 200): void {
  const existingTimer = preloadTimers.get(entryId);
  if (existingTimer) clearTimeout(existingTimer);

  const timer = setTimeout(async () => {
    try {
      const url = new URL(currentPath, window.location.origin);
      url.searchParams.set("edit", entryId);
      await preloadData(url.pathname + url.search);
      logger.debug(`[Preload] Entry ${entryId.substring(0, 8)}`);
    } catch (error) {
      logger.warn("[Preload ERROR]", error);
    } finally {
      preloadTimers.delete(entryId);
    }
  }, delay);

  preloadTimers.set(entryId, timer as unknown as number);
}

export function cancelPreload(entryId: string): void {
  const timer = preloadTimers.get(entryId);
  if (timer) {
    clearTimeout(timer);
    preloadTimers.delete(entryId);
  }
}

/**
 * Reflects the current UI mode and entry in the URL without a full navigation.
 */
export function reflectModeInURL(
  mode: ModeType,
  entryId?: string,
  options: { replaceState?: boolean } = {},
): void {
  if (!IS_BROWSER) return;

  const url = new URL(window.location.href);
  url.searchParams.delete("edit");
  url.searchParams.delete("create");

  if (mode === "edit" && entryId) url.searchParams.set("edit", entryId);
  else if (mode === "create") url.searchParams.set("create", "true");

  const method = options.replaceState ? "replaceState" : "pushState";
  window.history[method]({}, "", url.toString());
  logger.debug(`[URL] ${mode}${entryId ? ` (${entryId.substring(0, 8)})` : ""}`);
}

/**
 * Parses the current URL to determine the mode and entry ID.
 */
export function parseURLToMode(url: URL): ParsedURL {
  const editParam = url.searchParams.get("edit");
  const createParam = url.searchParams.get("create");

  let mode: ModeType = "view";
  let entryId: string | undefined;

  if (editParam) {
    mode = "edit";
    entryId = editParam;
  } else if (createParam === "true") {
    mode = "create";
  }

  const pathParts = url.pathname.split("/").filter(Boolean);
  return {
    mode,
    entryId,
    language: pathParts[0] || "en",
    collectionPath: pathParts.slice(1).join("/"),
  };
}

// --- Navigation Manager Class (Merged from navigation-manager.ts) ---

class NavigationManager {
  private navigating = false;

  get isNavigating(): boolean {
    return this.navigating;
  }

  private async executeNavigation(action: string, task: () => Promise<void>): Promise<void> {
    if (this.navigating) {
      logger.warn(`[Navigation] ${action} blocked - already in progress`);
      return;
    }

    this.navigating = true;
    globalLoadingStore.startLoading(loadingOperations.navigation, action);

    try {
      await task();
    } catch (err) {
      logger.error(`[Navigation] ${action} failed`, err);
      throw err;
    } finally {
      globalLoadingStore.stopLoading(loadingOperations.navigation);
      this.navigating = false;
    }
  }

  /**
   * Navigate to list view and reset state.
   */
  async toList(options?: { invalidate?: boolean }): Promise<void> {
    await this.executeNavigation("toList", async () => {
      if (IS_BROWSER) {
        document.dispatchEvent(
          new CustomEvent("entrySaved", { bubbles: true, detail: { timestamp: Date.now() } }),
        );
      }

      dataChangeStore.reset();
      setCollectionValue({});

      const ok = await uiModeStore.transitionTo("view");
      if (!ok) {
        logger.error("[Navigation] Failed to transition to view mode");
        return;
      }

      await goto(page.url.pathname, {
        invalidateAll: options?.invalidate ?? true,
        replaceState: false,
      });
      logger.debug("[Navigation] Navigated to list view");
    });
  }

  /**
   * Navigate to edit entry view.
   */
  async toEdit(entryId: string): Promise<void> {
    if (!entryId?.trim()) {
      logger.warn("[Navigation] Edit navigation aborted: Invalid ID");
      return;
    }

    await this.executeNavigation(`toEdit(${entryId})`, async () => {
      const ok = await uiModeStore.transitionTo("edit");
      if (!ok) {
        logger.error("[Navigation] Failed to transition to edit mode");
        return;
      }

      await goto(`${page.url.pathname}?edit=${entryId}`);
      logger.debug(`[Navigation] Navigated to edit: ${entryId}`);
    });
  }

  /**
   * Navigate to create entry view.
   */
  async toCreate(): Promise<void> {
    await this.executeNavigation("toCreate", async () => {
      const ok = await uiModeStore.transitionTo("create");
      if (!ok) {
        logger.error("[Navigation] Failed to transition to create mode");
        return;
      }

      await goto(`${page.url.pathname}?create=true`);
      logger.debug("[Navigation] Navigated to create view");
    });
  }

  /**
   * Emergency unlock for navigation state.
   */
  forceUnlock(): void {
    logger.warn("[Navigation] Force unlock triggered");
    this.navigating = false;
    globalLoadingStore.stopLoading(loadingOperations.navigation);
  }
}

export const navigationManager = new NavigationManager();

// --- Compatibility Exports ---
export const navigationUtils = { preloadEntry, cancelPreload, reflectModeInURL, parseURLToMode };
