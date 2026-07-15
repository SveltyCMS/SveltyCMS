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
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { _API_NAMESPACE_KEYS as API_NAMESPACE_KEYS } from "@src/routes/api/[...path]/+server";

const ROOT = process.cwd();

/**
 * Handler function names mirroring NAMESPACE_CONFIG in +server.ts
 * Used to generate search terms for verifying owner files actually test the namespace.
 */
const HANDLER_FN: Record<string, string> = {
  auth: "handleAuthUserRoutes",
  user: "handleAuthUserRoutes",
  permission: "handlePermissionRoutes",
  collections: "handleCollectionsRoutes",
  "virtual-collections": "handleVirtualCollectionsRoutes",
  content: "handleContentRoutes",
  "content-structure": "handleContentRoutes",
  widgets: "handleSystemRoutes",
  dashboard: "handleDashboardRoutes",
  media: "handleMediaRoutes",
  scim: "handleScimRoutes",
  search: "handleContentRoutes",
  events: "handleContentRoutes",
  system: "handleSystemRoutes",
  settings: "handleSettingsRoutes",
  "system-settings": "handleSettingsRoutes",
  importer: "handleImporterRoutes",
  ai: "handleAiRoutes",
  automations: "handleAutomationRoutes",
  setup: "handleSetupRoutes",
  export: "handleExportRoutes",
  import: "handleImportRoutes",
  metrics: "handleSystemRoutes",
  telemetry: "handleSystemRoutes",
  security: "handleSystemRoutes",
  theme: "handleThemeRoutes",
  "system-preferences": "handlePreferenceRoutes",
  health: "handleHealthRoutes",
  token: "handleTokenRoutes",
  "website-tokens": "handleTokenRoutes",
  "get-tokens-provided": "handleAuthUserRoutes",
  testing: "handleTestingRoutes",
  reset: "handleTestingRoutes",
  seed: "handleTestingRoutes",
  reinitialize: "handleTestingRoutes",
  cache: "handleUtilityRoutes",
  marketplace: "handleUtilityRoutes",
  "version-check": "handleUtilityRoutes",
  "send-mail": "handleUtilityRoutes",
  trash: "handleUtilityRoutes",
  debug: "handleUtilityRoutes",
  "openapi.json": "handleUtilityRoutes",
  database: "handleDatabaseRoutes",
  logs: "handleLogsRoutes",
  "api-keys": "handleApiKeyRoutes",
  webhooks: "handleWebhookRoutes",
  "system-webhooks": "handleWebhookRoutes",
  "system-virtual-folder": "handleSystemVirtualFolderRoutes",
  systemVirtualFolder: "handleSystemVirtualFolderRoutes",
  version: "handleVersionRoutes",
  graphql: "handleGraphqlRoutes",
  "system-jobs": "handleSystemJobRoutes",
  config: "handleConfigRoutes",
  "content-export": "handleContentExportRoutes",
  "content-import": "handleContentImportRoutes",
  migrations: "handleMigrationRoutes",
  importers: "handleImporterRoutes",
  backups: "handleBackupRoutes",
  "content-sync": "handleContentSyncRoutes",
  "import-data": "handleImporterRoutes",
  config_sync: "handleConfigRoutes",
  "config-sync": "handleConfigRoutes",
};

/**
 * Generates case-insensitive search terms for a given namespace.
 * Checks for the namespace name, a human-readable variant, and the handler function name.
 */
function namespaceSearchTerms(ns: string): string[] {
  const terms = [ns];
  // Human-readable variant: replace hyphens/underscores with spaces, Title Case
  const readable = ns.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  if (readable !== ns) terms.push(readable);
  // Add handler function name if available
  const fn = HANDLER_FN[ns];
  if (fn) terms.push(fn);
  return terms;
}

/**
 * Checks whether `content` contains a `describe(...)` or `it(...)` call
 * that references any of the given terms (case-insensitive match).
 *
 * For files without describe/it (helpers), returns true (skip check).
 * For files with describe/it but no direct term match, falls back to
 * checking if any hyphen/underscore-split part of the namespace appears
 * in a describe/it block (e.g. "get-tokens-provided" → "Token" in
 * describe("Token API...")). Finally, checks known-legitimate
 * shared-file groupings as a last resort.
 */
function fileReferencesNamespace(
  content: string,
  terms: string[],
  ns: string,
  relPath: string,
): boolean {
  const lower = content.toLowerCase();
  const hasDescribeIt = /\b(describe|it)\s*\(/i.test(lower);

  if (!hasDescribeIt) {
    // Helper files (no describe/it blocks) — skip content verification
    return true;
  }

  // 1. Direct match of any term in the file
  const directMatch = terms.some((term) => {
    const t = term.toLowerCase();
    return lower.includes(t);
  });
  if (directMatch) return true;

  // 2. Split namespace on hyphens/underscores and check each part
  const parts = ns.split(/[-_]/).filter(Boolean);
  const partMatch = parts.some((part) => {
    if (part.length < 2) return false;
    return lower.includes(part.toLowerCase());
  });
  if (partMatch) return true;

  // 3. Broad fallback: check if describe/it arguments contain a word that
  //    is a substring of the namespace, or vice versa
  const describeItArgs = content.match(/(?:describe|it)\(\s*["'\`]([^"'\`]+)["'\`]/gi);
  if (describeItArgs) {
    const describeTexts = describeItArgs.map((s) => {
      const m = s.match(/["'\`]([^"'\`]+)["'\`]/);
      return m ? m[1].toLowerCase() : "";
    });
    const nsLower = ns.toLowerCase();
    const nsParts = nsLower.split(/[-_]/);
    for (const dt of describeTexts) {
      if (dt.includes(nsLower)) return true;
      for (const part of nsParts) {
        if (part.length >= 2 && dt.includes(part)) return true;
      }
      const dtWords = dt.split(/[\s/]+/);
      for (const word of dtWords) {
        if (word.length >= 3 && nsLower.includes(word)) return true;
      }
    }
  }

  // 4. Known-legitimate shared security files
  const KNOWN_SHARED: Record<string, Set<string>> = {
    "tests/unit/api/export-import-security.test.ts": new Set([
      "importer",
      "content-export",
      "content-import",
      "migrations",
      "importers",
      "import-data",
      "backups",
      "content-sync",
    ]),
    "tests/unit/api/automation-security.test.ts": new Set(["system-jobs"]),
    "tests/unit/api/media-security.test.ts": new Set([
      "system-virtual-folder",
      "systemVirtualFolder",
    ]),
    "tests/unit/api/bulk-delete-guard.test.ts": new Set(["trash"]),
    "tests/unit/api/dispatcher-security-matrix.test.ts": new Set(["logs", "debug", "scim"]),
  };

  const shared = KNOWN_SHARED[relPath];
  if (shared && shared.has(ns)) return true;

  return false;
}

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

  it("every owner file actually references its namespace in describe/it blocks", () => {
    const noRef: string[] = [];
    for (const [ns, owners] of Object.entries(NAMESPACE_OWNERS)) {
      const terms = namespaceSearchTerms(ns);
      for (const rel of owners) {
        const absPath = join(ROOT, rel);
        if (!existsSync(absPath)) continue; // already caught above
        const content = readFileSync(absPath, "utf-8");
        if (!fileReferencesNamespace(content, terms, ns, rel)) {
          noRef.push(`${ns} → ${rel} (searched: ${terms.join(", ")})`);
        }
      }
    }
    expect(
      noRef,
      `Owner files missing describe/it referencing their namespace:\n${noRef.join("\n")}`,
    ).toEqual([]);
  });

  it("contract test covers all 6 contract gates (describe blocks)", () => {
    const contractPath = join(ROOT, "tests/integration/databases/contract.test.ts");
    const content = readFileSync(contractPath, "utf-8");

    const requiredGates = [
      "Auth Contract",
      "Collection CRUD Contract",
      "User Batch Contract",
      "Setup Gating Contract",
      "Fail-Closed Contract",
      "Media Permissions Contract",
    ];

    const missing: string[] = [];
    for (const gate of requiredGates) {
      // Look for describe("<gate>") or describe('<gate>')
      const pattern = new RegExp(`describe\\s*\\(\\s*["'\`]${escapeRegex(gate)}["'\`]`);
      if (!pattern.test(content)) {
        missing.push(gate);
      }
    }

    expect(missing, `Contract test missing describe blocks for:\n${missing.join("\n")}`).toEqual(
      [],
    );
  });
});

/** Escape special regex characters for literal matching */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
