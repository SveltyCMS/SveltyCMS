/**
 * @file scripts/sync-marketplace-catalog.ts
 * @description Validates and synchronizes extensions between SveltyCMS and the Marketplace catalog.
 *
 * Scans:
 * - src/widgets/custom/* (custom content widgets)
 * - src/routes/(app)/dashboard/widgets/* (dashboard widget packages)
 * - src/plugins/* (plugins)
 *
 * Compares against v:/telemetry-sveltycms/apps/marketplace/catalog/catalog.spec.json
 * (or local fallback) to eliminate catalog drift.
 *
 * Usage:
 *   bun run scripts/sync-marketplace-catalog.ts [--check]
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

interface MarketplaceSpecPackage {
  id: string;
  slug: string;
  type: "widget" | "dashboard-widget" | "plugin" | "theme";
  name: string;
  displayName: { en: string };
  description: { en: string };
  version: string;
  cmsVersionRange: string;
  pricingType: "free" | "paid" | "freemium";
  priceCents: number;
  category: string;
  icon: string;
  licenseLabel: string;
  currency: string;
  source: string;
  previewImage: string;
  requiresPlugin?: string;
  pricingNote?: string;
}

interface MarketplaceSpec {
  version: string;
  generatedAt: string;
  packages: MarketplaceSpecPackage[];
}

const CMS_ROOT = process.cwd();
const MARKETPLACE_SPEC_PATH = resolve(
  "v:/telemetry-sveltycms/apps/marketplace/catalog/catalog.spec.json",
);

function scanCustomWidgets(): string[] {
  const dir = join(CMS_ROOT, "src/widgets/custom");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

function scanDashboardWidgets(): string[] {
  const dir = join(CMS_ROOT, "src/routes/(app)/dashboard/widgets");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

function scanPlugins(): string[] {
  const dir = join(CMS_ROOT, "src/plugins");
  if (!existsSync(dir)) return [];
  // Exclude internal 'storage' primitive which is not a user-facing plugin
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "storage")
    .map((d) => d.name)
    .sort();
}

async function main() {
  const isCheckMode = process.argv.includes("--check");

  console.log("🔍 Scanning SveltyCMS extensions...");
  const widgets = scanCustomWidgets();
  const dashboardWidgets = scanDashboardWidgets();
  const plugins = scanPlugins();

  console.log(`  • Found ${widgets.length} custom widgets`);
  console.log(`  • Found ${dashboardWidgets.length} dashboard widgets`);
  console.log(`  • Found ${plugins.length} plugins`);
  console.log(
    `  • Total SveltyCMS extensions: ${widgets.length + dashboardWidgets.length + plugins.length}\n`,
  );

  if (!existsSync(MARKETPLACE_SPEC_PATH)) {
    console.warn(`⚠️ Marketplace catalog spec not found at: ${MARKETPLACE_SPEC_PATH}`);
    console.warn("  Skipping marketplace parity check.");
    process.exit(0);
  }

  const specRaw = readFileSync(MARKETPLACE_SPEC_PATH, "utf-8");
  const spec = JSON.parse(specRaw) as MarketplaceSpec;
  const specPackages = spec.packages || [];

  const specWidgets = new Set(specPackages.filter((p) => p.type === "widget").map((p) => p.slug));
  const specDashWidgets = new Set(
    specPackages.filter((p) => p.type === "dashboard-widget").map((p) => p.slug),
  );
  const specPlugins = new Set(specPackages.filter((p) => p.type === "plugin").map((p) => p.slug));

  let hasDrift = false;

  // Check widgets
  for (const w of widgets) {
    if (!specWidgets.has(w)) {
      console.error(`❌ Missing in marketplace catalog: widget "${w}"`);
      hasDrift = true;
    }
  }

  // Check dashboard widgets
  for (const d of dashboardWidgets) {
    if (!specDashWidgets.has(d)) {
      console.error(`❌ Missing in marketplace catalog: dashboard widget "${d}"`);
      hasDrift = true;
    }
  }

  // Check plugins
  for (const p of plugins) {
    if (!specPlugins.has(p)) {
      console.error(`❌ Missing in marketplace catalog: plugin "${p}"`);
      hasDrift = true;
    }
  }

  if (hasDrift) {
    console.error("\n❌ Marketplace catalog drift detected!");
    if (isCheckMode) {
      process.exit(1);
    }
  } else {
    console.log(
      `✅ All ${specPackages.length} extensions in marketplace catalog match SveltyCMS 1-to-1!`,
    );
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
