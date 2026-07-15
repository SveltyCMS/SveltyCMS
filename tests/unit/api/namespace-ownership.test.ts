/**
 * @file tests/unit/api/namespace-ownership.test.ts
 * @description
 * Phase D completeness gate: every catch-all API namespace must declare a unit
 * and/or integration test owner. Prevents silent API surface growth without tests.
 *
 * When this fails: add the new namespace to NAMESPACE_OWNERS below with at least
 * one existing (or new) test file path.
 */

import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { _API_NAMESPACE_KEYS as API_NAMESPACE_KEYS } from "@src/routes/api/[...path]/+server";

const ROOT = process.cwd();

/**
 * Map: namespace → test file paths that cover it (unit and/or integration).
 * Paths are relative to repo root for human navigation.
 */
export const NAMESPACE_OWNERS: Record<string, string[]> = {
  // Auth / users
  auth: ["tests/unit/api/auth-2fa.test.ts", "tests/integration/api/auth-2fa.test.ts"],
  user: ["tests/unit/api/user.test.ts", "tests/integration/api/user.test.ts"],
  permission: [
    "tests/unit/api/config-permissions.test.ts",
    "tests/integration/api/permissions.test.ts",
  ],
  "get-tokens-provided": ["tests/unit/api/token.test.ts"],

  // Content
  collections: ["tests/unit/api/collections.test.ts", "tests/integration/api/collections.test.ts"],
  "virtual-collections": ["tests/unit/api/collections.test.ts"],
  content: ["tests/integration/api/collections.test.ts"],
  "content-structure": ["tests/integration/api/collections.test.ts"],
  search: ["tests/integration/api/search.test.ts"],
  events: ["tests/unit/api/event-security.test.ts"],
  graphql: [
    "tests/unit/api/graphql-security.test.ts",
    "tests/unit/graphql/multi-tenancy-isolation.test.ts",
    "tests/integration/api/graphql.test.ts",
  ],

  // Media
  media: [
    "tests/unit/api/media-security.test.ts",
    "tests/unit/api/media-security-critical.test.ts",
    "tests/integration/api/media.test.ts",
  ],

  // System
  system: ["tests/integration/api/system.test.ts"],
  settings: ["tests/unit/api/settings-security.test.ts", "tests/integration/api/settings.test.ts"],
  "system-settings": ["tests/unit/api/settings-security.test.ts"],
  widgets: ["tests/unit/api/widget-security.test.ts", "tests/integration/api/widgets.test.ts"],
  dashboard: ["tests/integration/api/dashboard.test.ts"],
  health: ["tests/integration/api/system.test.ts"],
  theme: ["tests/integration/api/theme.test.ts"],
  "system-preferences": ["tests/integration/api/settings.test.ts"],
  metrics: ["tests/integration/api/metrics.test.ts"],
  telemetry: ["tests/integration/api/telemetry.test.ts"],
  security: ["tests/unit/api/security.test.ts", "tests/integration/api/security.test.ts"],
  logs: ["tests/unit/api/dispatcher-security-matrix.test.ts"],
  database: ["tests/integration/databases/contract.test.ts"],
  version: ["tests/unit/api/version.test.ts", "tests/integration/api/version.test.ts"],
  "system-jobs": ["tests/unit/api/automation-security.test.ts"],
  automations: ["tests/unit/api/automation-security.test.ts"],
  ai: ["tests/unit/api/ai-security.test.ts", "tests/unit/api/ai-copilot.test.ts"],
  importer: ["tests/unit/api/export-import-security.test.ts"],
  export: ["tests/unit/api/export-import-security.test.ts"],
  import: ["tests/unit/api/export-import-security.test.ts"],
  webhooks: ["tests/unit/api/webhook-security.test.ts"],
  "system-webhooks": ["tests/unit/api/webhook-security.test.ts"],
  "system-virtual-folder": ["tests/unit/api/media-security.test.ts"],
  systemVirtualFolder: ["tests/unit/api/media-security.test.ts"],

  // Tokens / keys
  token: ["tests/unit/api/token.test.ts", "tests/integration/api/token.test.ts"],
  "website-tokens": ["tests/integration/api/website-tokens.test.ts"],
  "api-keys": ["tests/unit/routes/api-keys-handler.test.ts"],

  // Setup / testing
  setup: ["tests/unit/api/setup-utils.test.ts", "tests/integration/api/setup-actions.test.ts"],
  testing: ["tests/integration/helpers/test-setup.ts"],
  reset: ["tests/integration/helpers/test-setup.ts"],
  seed: ["tests/integration/helpers/test-setup.ts"],
  reinitialize: ["tests/integration/helpers/test-setup.ts"],

  // Utility
  cache: ["tests/integration/api/cache.test.ts"],
  marketplace: ["tests/integration/api/marketplace.test.ts"],
  "version-check": ["tests/unit/api/version.test.ts"],
  "send-mail": ["tests/integration/api/mail.test.ts"],
  trash: ["tests/unit/api/bulk-delete-guard.test.ts"],
  debug: ["tests/unit/api/dispatcher-security-matrix.test.ts"],
  "openapi.json": ["tests/unit/api/openapi.test.ts", "tests/integration/api/openapi.test.ts"],

  // Enterprise
  scim: ["tests/unit/api/scim.test.ts", "tests/unit/api/dispatcher-security-matrix.test.ts"],

  // Data operations
  config: [
    "tests/unit/api/config-permissions.test.ts",
    "tests/integration/api/config-sync.test.ts",
  ],
  config_sync: ["tests/integration/api/config-sync.test.ts"],
  "config-sync": ["tests/integration/api/config-sync.test.ts"],
  "content-export": ["tests/unit/api/export-import-security.test.ts"],
  "content-import": ["tests/unit/api/export-import-security.test.ts"],
  migrations: ["tests/unit/api/export-import-security.test.ts"],
  importers: ["tests/unit/api/export-import-security.test.ts"],
  "import-data": ["tests/unit/api/export-import-security.test.ts"],
  backups: ["tests/unit/api/export-import-security.test.ts"],
  "content-sync": ["tests/unit/api/export-import-security.test.ts"],
};

describe("API namespace ownership inventory (completeness Phase D)", () => {
  it("exports a non-empty namespace key list from the catch-all gatekeeper", () => {
    expect(API_NAMESPACE_KEYS.length).toBeGreaterThan(20);
  });

  it("every NAMESPACE_CONFIG key has at least one declared test owner", () => {
    const missing: string[] = [];
    for (const key of API_NAMESPACE_KEYS) {
      const owners = NAMESPACE_OWNERS[key];
      if (!owners || owners.length === 0) {
        missing.push(key);
      }
    }
    expect(missing, `Add owners in NAMESPACE_OWNERS for: ${missing.join(", ")}`).toEqual([]);
  });

  it("NAMESPACE_OWNERS does not list unknown namespaces (stale cleanup)", () => {
    const live = new Set(API_NAMESPACE_KEYS);
    const stale = Object.keys(NAMESPACE_OWNERS).filter((k) => !live.has(k));
    expect(stale, `Remove stale NAMESPACE_OWNERS keys: ${stale.join(", ")}`).toEqual([]);
  });

  it("every declared owner path exists on disk", () => {
    const missingFiles: string[] = [];
    for (const [ns, owners] of Object.entries(NAMESPACE_OWNERS)) {
      for (const rel of owners) {
        if (!existsSync(join(ROOT, rel))) {
          missingFiles.push(`${ns} → ${rel}`);
        }
      }
    }
    expect(
      missingFiles,
      `Owner paths missing (fix NAMESPACE_OWNERS):\n${missingFiles.join("\n")}`,
    ).toEqual([]);
  });
});
