/**
 * @file src/utils/navigation.ts
 * @description Unified navigation system for SveltyCMS.
 *
 * ### Hardening (audit 2026-07):
 * - Race-condition guard: AbortController cancels stale navigation promises on rapid clicks
 * - Memory-leak protection: preloadTimers properly cleaned up with proper ReturnType typing
 * - URL sanitization: slugify uses escaped regex to prevent injection/backtracking
 * - encodeURIComponent: entryId is URL-encoded for safety
 *
 * Consolidates:
 * - NavigationManager (locking, mode transitions, loading state)
 * - Navigation Utilities (preloading, URL parsing, reflection)
 * - Slugify (URL-safe identifier generation)
 */

import { goto, preloadData } from "$app/navigation";
import { page } from "$app/state";
import type { ReadonlyURLSearchParams } from "$app/state";
import {
  setCollectionValue,
  collections,
  type ModeType,
} from "@src/stores/collection-store.svelte";
import { globalLoadingStore, loadingOperations } from "@src/stores/loading-store.svelte.ts";
import { modeTransitionGuard } from "@stores/mode-transition-guard.svelte";
import { logger } from "./logger";

const IS_BROWSER = typeof window !== "undefined";

// --- Types ---

interface ParsedURL {
  collectionPath: string;
  entryId?: string;
  language: string;
  mode: ModeType;
}

interface SlugifyOptions {
  replacement?: string;
  remove?: RegExp;
  lower?: boolean;
  strict?: boolean;
  trim?: boolean;
}

// --- Slugification ---

/**
 * Converts a string into a URL-safe slug.
 * Handles potential regex injection and catastrophic backtracking.
 */
export function slugify(string: string, options: SlugifyOptions = {}): string {
  if (typeof string !== "string") return "";

  const { replacement = "-", lower = true, strict = true, trim = true } = options;

  let slug = string.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (options.remove) slug = slug.replace(options.remove, "");
  if (lower) slug = slug.toLowerCase();

  // Escape replacement for regex safety
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  slug = slug.replace(new RegExp(`[_.\\s]+`, "g"), replacement);

  if (strict) {
    slug = slug.replace(new RegExp(`[^a-z0-9${esc(replacement)}]`, "gi"), "");
  }

  slug = slug.replace(new RegExp(`(${esc(replacement)}){2,}`, "g"), replacement);

  if (trim) {
    const r = esc(replacement);
    slug = slug.replace(new RegExp(`^${r}+|${r}+$`, "g"), "");
  }

  return slug;
}

// --- Navigation Utilities ---

const preloadTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Preloads entry data with a delay to prevent aggressive prefetching.
 */
export function preloadEntry(entryId: string, currentPath: string, delay = 200): void {
  cancelPreload(entryId);

  const timer = setTimeout(async () => {
    try {
      const url = new URL(currentPath, window.location.origin);
      url.searchParams.set("edit", entryId);
      await preloadData(url.pathname + url.search);
    } catch (error) {
      logger.warn(`[Preload] Failed for ${entryId}`, error);
    } finally {
      preloadTimers.delete(entryId);
    }
  }, delay);

  preloadTimers.set(entryId, timer);
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
}

/**
 * Parses the current URL to determine the mode and entry ID.
 * Accepts both mutable `URL` and SvelteKit 3's readonly page URL
 * (ReadonlyURLSearchParams) — parsing is read-only.
 */
export function parseURLToMode(
  url: URL | { searchParams: URLSearchParams | ReadonlyURLSearchParams; pathname: string },
): ParsedURL {
  const editParam = url.searchParams.get("edit");
  const createParam = url.searchParams.get("create");

  return {
    mode: editParam ? "edit" : createParam === "true" ? "create" : "view",
    entryId: editParam ?? undefined,
    language: url.pathname.split("/").filter(Boolean)[0] || "en",
    collectionPath: url.pathname.split("/").filter(Boolean).slice(1).join("/"),
  };
}

// --- Navigation Manager ---

class NavigationManager {
  private navAbortController: AbortController | null = null;
  navigating = false;

  get isNavigating(): boolean {
    return this.navigating;
  }

  private async executeNavigation(
    action: string,
    task: (signal: AbortSignal) => Promise<void>,
  ): Promise<void> {
    // Rapid clicks must not stack navigations. The in-flight run is aborted, and its
    // `signal` lets the task bail out before it mutates state or pushes a route —
    // the previous version created a controller nobody ever read, so it cancelled
    // nothing (and the stale run cleared the newer run's loading state).
    this.navAbortController?.abort();
    const controller = new AbortController();
    this.navAbortController = controller;

    this.navigating = true;
    globalLoadingStore.startLoading(loadingOperations.navigation, action);

    try {
      await task(controller.signal);
    } finally {
      // Only the newest navigation owns the loading state: a superseded call must
      // not hide the spinner the newer one just started.
      if (this.navAbortController === controller) {
        this.navAbortController = null;
        globalLoadingStore.stopLoading(loadingOperations.navigation);
        this.navigating = false;
      }
    }
  }

  /**
   * Navigate to list view and reset state.
   */
  async toList(options?: { invalidate?: boolean }): Promise<void> {
    await this.executeNavigation("toList", async (signal) => {
      if (signal.aborted) return;
      collections.resetChanges();
      setCollectionValue({});

      if (!(await modeTransitionGuard.transitionTo("view"))) return;
      if (signal.aborted) return;

      await goto(page.url.pathname, {
        refreshAll: options?.invalidate ?? true,
        replace: false,
      });
    });
  }

  /**
   * Navigate to edit entry view.
   */
  async toEdit(entryId: string): Promise<void> {
    if (!entryId?.trim()) return;

    await this.executeNavigation(`toEdit(${entryId})`, async (signal) => {
      if (!(await modeTransitionGuard.transitionTo("edit"))) return;
      if (signal.aborted) return;
      await goto(`${page.url.pathname}?edit=${encodeURIComponent(entryId)}`);
    });
  }

  /**
   * Navigate to create entry view.
   */
  async toCreate(): Promise<void> {
    await this.executeNavigation("toCreate", async (signal) => {
      if (!(await modeTransitionGuard.transitionTo("create"))) return;
      if (signal.aborted) return;
      await goto(`${page.url.pathname}?create=true`);
    });
  }
}

export const navigationManager = new NavigationManager();
