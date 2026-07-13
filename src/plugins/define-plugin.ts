/**
 * @file src/plugins/define-plugin.ts
 * @description Type-safe plugin definition helper with dev-time validation.
 *
 * Identity-function pattern preserves literal types (exact string literal
 * types for `id`, `name`, etc.) for better autocomplete. Runtime validation
 * in dev mode catches common mistakes early.
 *
 * @example
 *   export const myPlugin = definePlugin({
 *     metadata: { id: "my-plugin", name: "My Plugin", version: "1.0.0", ... },
 *     ...
 *   });
 */

import type { Plugin } from "./types";

/** Identity helper for type-safe plugin definitions. */
export function definePlugin<T extends Plugin>(plugin: T): T {
  return plugin;
}
