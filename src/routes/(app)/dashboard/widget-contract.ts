/**
 * @file src/routes/(app)/dashboard/widget-contract.ts
 * @description Standardized contracts, schemas, and types for SveltyCMS dashboard widgets.
 *
 * Features:
 * - Valibot validation schemas for widget configs, manifests, and sizes
 * - Strictly typed developer contracts without `any`
 * - Sandboxed context and event types for extensible dashboard architecture
 */

import * as v from "valibot";
import type { DashboardWidgetConfig, WidgetSize } from "@src/content/types";
import type {
  DashboardWidgetCategory,
  DashboardWidgetLicense,
} from "@src/services/core/dashboard-manifest-registry";

export type { DashboardWidgetCategory, DashboardWidgetLicense };

/** Context key used by `widget-scope.svelte` to expose per-instance data. */
export const WIDGET_SCOPE_KEY = "sveltycms:dashboard-widget-scope";

/**
 * Per-tile values the dashboard provides to a widget without every widget
 * having to forward them through its own props.
 */
export interface WidgetScopeContext {
  readonly settings: Record<string, unknown>;
  readonly tenantId: string;
  readonly userId: string;
  readonly accessAllowed: boolean;
  readonly license?: DashboardWidgetLicense;
}

export const WidgetSizeSchema = v.object({
  w: v.pipe(v.number(), v.minValue(1), v.maxValue(4)),
  h: v.pipe(v.number(), v.minValue(1), v.maxValue(4)),
});

export const DashboardWidgetConfigSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  component: v.pipe(v.string(), v.minLength(1)),
  label: v.pipe(v.string(), v.minLength(1)),
  icon: v.string(),
  size: WidgetSizeSchema,
  settings: v.optional(v.record(v.string(), v.unknown()), {}),
  order: v.optional(v.number()),
  gridPosition: v.optional(v.number()),
});

export const DashboardWidgetManifestSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  name: v.pipe(v.string(), v.minLength(1)),
  description: v.optional(v.string()),
  icon: v.pipe(v.string(), v.minLength(1)),
  version: v.string(),
  sveltycms: v.string(),
  type: v.literal("dashboard-widget"),
  author: v.string(),
  license: v.picklist(["free", "freemium", "paid"]),
  price: v.optional(v.number()),
  component: v.string(),
  defaultSize: WidgetSizeSchema,
  category: v.optional(v.picklist(["monitoring", "logs", "content", "static"])),
  requiresPlugin: v.optional(v.string()),
  requiresPermission: v.optional(v.string()),
  requiresAdmin: v.optional(v.boolean()),
});

export type ValidatedDashboardWidgetManifest = v.InferOutput<typeof DashboardWidgetManifestSchema>;

/**
 * Sandboxed fetcher interface granted to widgets.
 * Restricts requests to safe internal APIs, injects CSRF headers, and manages timeouts.
 */
export interface SandboxedFetcher {
  <T = unknown>(endpoint: string, options?: RequestInit): Promise<T>;
}

/**
 * Isolated namespaced key-value storage for a widget instance.
 * Automatically scopes storage to the current tenant, user, and widget id.
 */
export interface SandboxedStorage {
  get<T = unknown>(key: string, defaultValue?: T): T | null;
  set<T = unknown>(key: string, value: T, ttlMs?: number): boolean;
  remove(key: string): void;
  clear(): void;
}

/**
 * Sandbox runtime interface provided to every widget.
 */
export interface WidgetSandboxContext {
  readonly widgetId: string;
  readonly component: string;
  readonly isOnline: boolean;
  readonly isTabVisible: boolean;
  fetch: SandboxedFetcher;
  storage: SandboxedStorage;
  notify: (message: string, type?: "info" | "success" | "warning" | "error") => void;
  requestRefresh: () => Promise<void>;
  updateSettings: (settings: Record<string, unknown>) => void;
}

/**
 * Standard typed props expected by modern SveltyCMS dashboard widgets.
 */
export interface WidgetProps<
  TData = unknown,
  TSettings extends Record<string, unknown> = Record<string, unknown>,
> {
  config?: DashboardWidgetConfig;
  label?: string;
  icon?: string;
  widgetId?: string;
  size?: WidgetSize;
  license?: DashboardWidgetLicense;
  theme?: "light" | "dark";
  currentUser?: {
    id: string;
    email?: string;
    username?: string;
    role?: string;
  };
  onSizeChange?: (newSize: WidgetSize) => void;
  onRemove?: () => void;
  initialData?: TData;
  settings?: TSettings;
}

/**
 * Children snippet parameter passed by BaseWidget.
 */
export interface BaseWidgetSnippetProps<
  TData = unknown,
  TSettings extends Record<string, unknown> = Record<string, unknown>,
> {
  data: TData | undefined;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  updateWidgetState: (key: string, value: unknown) => void;
  getWidgetState: (key: string) => unknown;
  sandbox: WidgetSandboxContext;
  settings: TSettings;
}

/**
 * Metadata definition for dashboard widgets.
 */
export interface WidgetMetaDefinition {
  name: string;
  icon: string;
  description?: string;
  defaultSize?: WidgetSize;
  category?: DashboardWidgetCategory;
  requiresPlugin?: string;
  requiresPermission?: string;
  requiresAdmin?: boolean;
}
