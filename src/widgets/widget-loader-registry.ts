/**
 * @file src/widgets/widget-loader-registry.ts
 * @description Central widget input/display loader registry with promise caching.
 *
 * Responsibilities:
 * - Delegate path resolution to `widgets/scanner` (Vite glob + Bun fallback).
 * - Deduplicate async imports so N fields sharing a widget type load once.
 * - Prefetch visible-tab widgets during idle time on entry open.
 *
 * ### Features:
 * - per-widget Promise cache
 * - typed input/display loader accessors
 * - store-metadata path override when available
 */

import type { WidgetRegistry } from "@src/stores/widget-store.svelte";
import { getComponentLoader, widgetComponents } from "./scanner";

type SvelteModule = { default: unknown };
type LoaderFn = () => Promise<SvelteModule>;

const inputLoaderCache = new Map<string, Promise<SvelteModule>>();
const displayLoaderCache = new Map<string, Promise<SvelteModule>>();

function loaderFromStorePath(
  widgetName: string,
  registry: WidgetRegistry,
  suffix: "input" | "display",
): LoaderFn | null {
  const fn = registry[widgetName];
  const storePath =
    (fn as { componentPath?: string; inputComponentPath?: string } | undefined)?.componentPath ||
    (fn as { componentPath?: string; inputComponentPath?: string } | undefined)?.inputComponentPath;

  const pathsToTry = [storePath].filter(Boolean) as string[];
  const normalized = widgetName.toLowerCase();
  pathsToTry.push(
    `./core/${normalized}/${suffix}.svelte`,
    `./custom/${normalized}/${suffix}.svelte`,
  );

  for (const pattern of pathsToTry) {
    if (pattern && widgetComponents[pattern]) {
      return widgetComponents[pattern] as LoaderFn;
    }
    for (const path in widgetComponents) {
      if (
        path.endsWith(pattern) ||
        path.toLowerCase().includes(`/${normalized}/${suffix}.svelte`)
      ) {
        return widgetComponents[path] as LoaderFn;
      }
    }
  }
  return null;
}

/** Resolve uncached input loader for a widget name. */
export function resolveWidgetInputLoader(
  widgetName: string,
  registry: WidgetRegistry,
): LoaderFn | null {
  if (!widgetName) return null;
  return (
    loaderFromStorePath(widgetName, registry, "input") || getComponentLoader(widgetName, "input")
  );
}

/** Resolve uncached display loader for a widget name. */
export function resolveWidgetDisplayLoader(
  widgetName: string,
  registry: WidgetRegistry,
): LoaderFn | null {
  if (!widgetName) return null;
  return (
    loaderFromStorePath(widgetName, registry, "display") ||
    getComponentLoader(widgetName, "display")
  );
}

function cachedLoader(
  widgetName: string,
  cache: Map<string, Promise<SvelteModule>>,
  resolver: (name: string, registry: WidgetRegistry) => LoaderFn | null,
  registry: WidgetRegistry,
): LoaderFn | null {
  const resolved = resolver(widgetName, registry);
  if (!resolved) return null;

  if (!cache.has(widgetName)) {
    cache.set(
      widgetName,
      resolved().catch((err) => {
        cache.delete(widgetName);
        throw err;
      }),
    );
  }

  return () => cache.get(widgetName)!;
}

/** Cached input loader — safe to call from every field row. */
export function getCachedWidgetInputLoader(
  widgetName: string,
  registry: WidgetRegistry,
): LoaderFn | null {
  return cachedLoader(widgetName, inputLoaderCache, resolveWidgetInputLoader, registry);
}

/** Cached display loader for list/read-only cells. */
export function getCachedWidgetDisplayLoader(
  widgetName: string,
  registry: WidgetRegistry,
): LoaderFn | null {
  return cachedLoader(widgetName, displayLoaderCache, resolveWidgetDisplayLoader, registry);
}

/** Prefetch unique widget loaders (typically on entry open / idle). */
export function prefetchWidgetLoaders(widgetNames: string[], registry: WidgetRegistry): void {
  const unique = [...new Set(widgetNames.filter(Boolean))];
  for (const name of unique) {
    const loader = getCachedWidgetInputLoader(name, registry);
    if (loader) loader().catch(() => {});
  }
}

/** Clear caches (tests / hot reload). */
export function clearWidgetLoaderCache(): void {
  inputLoaderCache.clear();
  displayLoaderCache.clear();
}
