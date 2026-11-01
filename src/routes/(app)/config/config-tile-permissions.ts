/**
 * @file src/routes/(app)/config/config-tile-permissions.ts
 * @description Config-tile context IDs mapped to canonical permission IDs.
 *
 * Every value must be a real `PERMISSION_CATALOG` id (retest m6): the earlier
 * `manage:*` / `access:*` spellings were never registered, so every tile failed
 * closed for a non-admin and an Editor saw an empty grid. Tiles for routes that
 * gate on `locals.isAdmin` map to `system:admin` — the same audience the page
 * actually admits — so the tile never promises a page that would answer 403.
 *
 * ### Features:
 * - single source of truth shared by the `/config` loader, the tile grid and tests
 * - maps to real catalog permissions only (verified by the loader contract test)
 * - keeps admin-only routes admin-gated
 */

export const CONFIG_TILE_PERMISSIONS: Record<string, string> = {
  "config:settings": "config:settings",
  // Design System is open to every authenticated user (personal appearance
  // overrides); the tile follows the editor-visible theme grant.
  "config:appearance": "config:themeManagement",
  "config:users": "user:manage",
  "config:roles": "user:manage",
  "config:collectionbuilder": "config:collectionbuilder",
  // The tile points at /config/collectionbuilder, whose guard requires
  // config:collectionbuilder (not the settings-only collectionManagement id).
  "config:collectionManagement": "config:collectionbuilder",
  "config:graphql": "config:graphql",
  "config:media": "media:write",
  "config:webhooks": "system:admin",
  "config:redirects": "system:admin",
  "config:trash": "system:admin",
  "config:dashboard": "dashboard:read",
  "config:imageeditor": "media:write",
  "config:widgetManagement": "config:widgetManagement",
  "config:themeManagement": "config:themeManagement",
  "config:accessManagement": "system:admin",
  "config:emailPreviews": "system:admin",
  "config:adminArea": "system:admin",
  // Tiles rendered by +page.svelte whose contextId was missing here, so every
  // non-admin failed closed on them and an Editor saw an empty grid (retest m6).
  "system:dashboard": "system:dashboard",
  "api:graphql": "api:graphql",
  "config:systemMonitor": "system:admin",
  "config:extensions": "system:admin",
  "config:automations": "system:admin",
  "config:queue": "system:admin",
  "config:synchronization": "config:synchronization",
  "system:admin": "system:admin",
};
