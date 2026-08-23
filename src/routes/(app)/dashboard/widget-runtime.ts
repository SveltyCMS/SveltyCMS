/**
 * @file src/routes/(app)/dashboard/widget-runtime.ts
 * @description Pure helpers for dashboard picker metadata, saved layouts, and poll gating.
 *
 * Features:
 * - map widget.json manifests to picker entries (no Svelte module eval)
 * - drop packages whose sveltycms range the host does not satisfy
 * - normalize persisted dashboard layouts from mixed API/DB envelopes
 * - skip scheduled widget polls while the document is hidden
 */

import type { DashboardWidgetConfig, WidgetSize } from "@src/content/types";
import { getCmsVersion, satisfiesCmsRange } from "@src/widgets/widget-compatibility";
import type {
  DashboardWidgetCategory,
  DashboardWidgetLicense,
  DashboardWidgetManifest,
} from "./widgets/manifest-registry";

export interface DashboardWidgetPickerInfo {
  category?: DashboardWidgetCategory;
  componentName: string;
  defaultSize: WidgetSize;
  description?: string;
  folder: string;
  icon: string;
  license: DashboardWidgetLicense;
  name: string;
  /** Plugin id that must be enabled before this optional widget is offered. */
  requiresPlugin?: string;
}

const DEFAULT_SIZE: WidgetSize = { w: 1, h: 1 };

function asSize(value: unknown): WidgetSize {
  if (!value || typeof value !== "object") return DEFAULT_SIZE;
  const size = value as { w?: unknown; h?: unknown };
  const w = typeof size.w === "number" && size.w >= 1 ? size.w : 1;
  const h = typeof size.h === "number" && size.h >= 1 ? size.h : 1;
  return { w, h };
}

function asWidget(value: unknown): DashboardWidgetConfig | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.component !== "string") return null;
  return {
    id: row.id,
    component: row.component,
    label: typeof row.label === "string" ? row.label : row.component,
    icon: typeof row.icon === "string" ? row.icon : "mdi:widgets",
    size: asSize(row.size),
    settings:
      row.settings && typeof row.settings === "object" && !Array.isArray(row.settings)
        ? (row.settings as Record<string, unknown>)
        : {},
    order: typeof row.order === "number" ? row.order : undefined,
    gridPosition: typeof row.gridPosition === "number" ? row.gridPosition : undefined,
  };
}

/**
 * Build the Add Widget picker list from compile-time manifests.
 * Incompatible CMS ranges are omitted so the client never imports them.
 */
export function manifestsToPickerList(
  manifests: DashboardWidgetManifest[],
  cmsVersion: string = getCmsVersion(),
): DashboardWidgetPickerInfo[] {
  const out: DashboardWidgetPickerInfo[] = [];
  for (const manifest of manifests) {
    if (!manifest?.id || !manifest.name) continue;
    if (manifest.sveltycms && !satisfiesCmsRange(cmsVersion, manifest.sveltycms)) continue;
    out.push({
      category: manifest.category,
      componentName: manifest.component || "index",
      defaultSize: asSize(manifest.defaultSize),
      description: manifest.description,
      folder: manifest.id,
      icon: manifest.icon || "mdi:widgets",
      license: manifest.license || "free",
      name: manifest.name,
      requiresPlugin: manifest.requiresPlugin,
    });
  }
  return out;
}

/**
 * Optional widgets that declare `requiresPlugin` stay out of the picker until
 * that plugin is enabled (e.g. commerce-orders while Commerce is off).
 */
export function filterPickerByPlugins(
  widgets: DashboardWidgetPickerInfo[],
  pluginStates: Readonly<Record<string, boolean>>,
): DashboardWidgetPickerInfo[] {
  return widgets.filter((widget) => {
    if (!widget.requiresPlugin) return true;
    return pluginStates[widget.requiresPlugin] === true;
  });
}

export function sortWidgetsByHotCollections<T extends { folder: string; componentName: string }>(
  widgets: T[],
  hotIds: ReadonlySet<string>,
): T[] {
  if (hotIds.size === 0) return widgets;
  return [...widgets].sort((a, b) => {
    const aHot = hotIds.has(a.folder) || hotIds.has(a.componentName);
    const bHot = hotIds.has(b.folder) || hotIds.has(b.componentName);
    if (aHot && !bHot) return -1;
    if (!aHot && bHot) return 1;
    return 0;
  });
}

/** Unwrap Layout / `{ value }` / `{ data }` / raw widget arrays from preferences storage. */
export function normalizeDashboardLayout(value: unknown): DashboardWidgetConfig[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.map(asWidget).filter((w): w is DashboardWidgetConfig => w !== null);
  }
  if (typeof value !== "object") return [];
  const row = value as Record<string, unknown>;
  if (Array.isArray(row.preferences)) {
    return row.preferences.map(asWidget).filter((w): w is DashboardWidgetConfig => w !== null);
  }
  if ("value" in row) return normalizeDashboardLayout(row.value);
  if ("data" in row) return normalizeDashboardLayout(row.data);
  return [];
}

/** Scheduled polls must not run while the tab is in the background. */
export function shouldSkipScheduledPoll(documentHidden: boolean): boolean {
  return documentHidden === true;
}

/**
 * After a tab becomes visible again, refetch only if the poll interval has elapsed.
 */
export function shouldFetchOnVisibility(
  documentHidden: boolean,
  lastFetchTime: number,
  pollInterval: number,
  now: number,
): boolean {
  if (documentHidden || pollInterval <= 0) return false;
  if (lastFetchTime <= 0) return true;
  return now - lastFetchTime >= pollInterval;
}
