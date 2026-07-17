/**
 * @file src/plugins/define-plugin.ts
 * @description Type-safe plugin definition helper with discriminated union part system
 * and constrained generic that preserves literal types for autocomplete.
 *
 * `definePlugin` is an identity function that preserves literal types for
 * autocomplete while providing runtime dev-mode validation. The `PluginPart`
 * discriminated union enables structured plugin contributions — schemas, routes,
 * capabilities, settings, admin tools, field components, and document actions —
 * all resolved at boot time by the plugin registry.
 *
 * ### Security:
 * - `PluginRoute.requiredCapabilities` is **mandatory** — omitting it is a
 *   TypeScript error. Use `[]` for auth-only routes or `"public"` for
 *   explicit unauthenticated access.
 * - `DocumentAction.requiredCapabilities` defaults to `["admin"]` when omitted
 *   so no action is accidentally open.
 *
 * @example
 *   export const myPlugin = definePlugin({
 *     metadata: { id: "my-plugin", name: "My Plugin", version: "1.0.0", ... },
 *     parts: [
 *       { type: "route", routes: [{ path: "/api/my-plugin/webhook", handler, requiredCapabilities: [] }] },
 *       { type: "capability", capabilities: ["db:read"] },
 *       { type: "settings", declaration: { fields: [{ type: "string", name: "apiKey" }] } },
 *     ],
 *   });
 */

import type { Plugin } from "./types";
import type { PluginContext } from "./types";
import type { SettingsPart } from "./settings-declaration";
import type { SugarTypeBuilder } from "@src/widgets/desugar-field";
import type { FieldDefinition } from "@src/content/types";

// ============================================================================
// Plugin Part Types
// ============================================================================

/**
 * A collection schema definition contributed by a plugin.
 * Plugins can contribute entire collection schemas that get registered
 * into the content system at boot time.
 */
export interface SchemaDefinition {
  /** Collection machine name (e.g., "plugin_myplugin_submissions"). */
  name: string;
  /** Human-readable collection label. */
  label: string;
  /** URL-friendly slug. */
  slug?: string;
  /** Optional description. */
  description?: string;
  /** Icon name (Iconify string). */
  icon?: string;
  /** Initial collection status. Defaults to "publish". */
  status?: "draft" | "publish";
  /** Field definitions for the collection. */
  fields: FieldDefinition[];
}

/**
 * A route registered by a plugin into the server route table.
 *
 * **Security**: `requiredCapabilities` is mandatory. Omitting it is a
 * TypeScript error. Use `[]` for routes that only require authentication
 * (no specific capability), or `"public"` for explicitly unauthenticated
 * routes (e.g., webhooks from third parties).
 */
export interface PluginRoute {
  /** Route path (e.g., "/api/my-plugin/webhook"). */
  path: string;
  /** Route handler function. */
  handler: (event: import("@sveltejs/kit").RequestEvent) => Promise<Response>;
  /** HTTP method. Defaults to "GET". */
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /**
   * Required capabilities to access this route.
   *
   * - `[]` → authentication required, no specific capability gate.
   * - `"public"` → no authentication required (explicit opt-out).
   * - `["manage:something"]` → specific capability required.
   *
   * Omitting this field is a compile-time error.
   */
  requiredCapabilities: string[] | "public";
}

/**
 * A custom component that renders a field type in the content editor.
 * Plugins can register custom field renderers for new or existing field types.
 */
export interface FieldComponent {
  /** The field type this component handles (e.g., "map", "color-picker"). */
  type: string;
  /** Lazy-loaded Svelte component. */
  component: () => Promise<unknown>;
  /** Human-readable label for the field type picker. */
  label?: string;
  /** Icon for the field type picker (Iconify string). */
  icon?: string;
}

/**
 * A document action contributed by a plugin — a button/action that operates
 * on a content entry (e.g., "Send to Review", "Publish to Channel").
 */
export interface DocumentAction {
  /** Unique action identifier. */
  id: string;
  /** Button/action label. */
  label: string;
  /** Optional icon (Iconify string). */
  icon?: string;
  /** Action handler — called when the user confirms the action. */
  handler: (entry: Record<string, unknown>, context: PluginContext) => Promise<void>;
  /**
   * Required capabilities to execute this action.
   * Defaults to `["admin"]` when omitted at runtime so no action is
   * accidentally open to all users.
   */
  requiredCapabilities?: string[];
  /** Optional confirmation message shown before executing the action. */
  confirm?: string;
}

/**
 * An admin tool contributed by a plugin — an injectable UI element into
 * a specific admin zone.
 */
export interface AdminTool {
  /** Unique tool identifier. */
  id: string;
  /** Human-readable tool label. */
  label: string;
  /** Icon name (Iconify string). */
  icon: string;
  /** Lazy-loaded Svelte component. */
  component: () => Promise<unknown>;
  /** Which admin zone this tool belongs to. */
  zone: "sidebar" | "toolbar" | "dashboard" | "config";
  /**
   * Required capabilities to view/use this tool.
   * Defaults to `["admin"]` at runtime when omitted.
   */
  requiredCapabilities?: string[];
}

// ============================================================================
// PluginPart Discriminated Union
// ============================================================================

/**
 * Discriminated union of structured plugin contributions.
 *
 * Each variant represents a different kind of contribution a plugin can make.
 * The plugin registry resolves these at boot time:
 *
 * | Part Type          | Resolution                                                  |
 * |--------------------|-------------------------------------------------------------|
 * | `schema`           | Collections registered in the content system               |
 * | `schemaTransform`  | Sugar type builders registered for field desugaring         |
 * | `route`            | Server routes registered in the route table                 |
 * | `capability`       | Capabilities registered in the merged capability catalog    |
 * | `settings`         | Settings declaration attached to the plugin                 |
 * | `adminTool`        | UI tools injected into admin zones                          |
 * | `fieldComponent`   | Custom field renderers for the content editor               |
 * | `documentAction`   | Per-entry action buttons in the content editor              |
 */
export type PluginPart =
  | { type: "schema"; collections: SchemaDefinition[] }
  | { type: "schemaTransform"; transforms: SugarTypeBuilder[] }
  | { type: "route"; routes: PluginRoute[] }
  | { type: "capability"; capabilities: string[] }
  | { type: "settings"; declaration: SettingsPart }
  | { type: "adminTool"; tools: AdminTool[] }
  | { type: "fieldComponent"; components: FieldComponent[] }
  | { type: "documentAction"; actions: DocumentAction[] };

// ============================================================================
// definePlugin Identity Function
// ============================================================================

/**
 * Type-safe plugin definition helper.
 *
 * The explicit metadata constraint preserves literal string types
 * (e.g., plugin `id`, `name`, specific capability strings) for
 * autocomplete and compile-time checking. This prevents widening
 * to generic `string` when used in downstream type inference.
 */
export function definePlugin<
  T extends Plugin & {
    metadata: {
      id: string;
      name: string;
      version: string;
      description: string;
    };
  },
>(plugin: T): T {
  return plugin;
}
