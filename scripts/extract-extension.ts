/**
 * @file scripts/extract-extension.ts
 * @description Extracts and packages a built-in or custom extension into a standalone,
 * marketplace-ready portable package.
 *
 * Supports:
 * - widget: src/widgets/custom/<name>
 * - dashboard: src/routes/(app)/dashboard/widgets/<name>
 * - plugin: src/plugins/<name>
 *
 * Usage:
 *   bun run scripts/extract-extension.ts <type> <name> [outputDir]
 *
 * Example:
 *   bun run scripts/extract-extension.ts widget phone-number ./dist-extensions
 */

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

type ExtensionType = "widget" | "dashboard" | "plugin";

function resolveSourceDir(type: ExtensionType, name: string): string {
  const root = process.cwd();
  switch (type) {
    case "widget":
      return join(root, "src/widgets/custom", name);
    case "dashboard":
      return join(root, "src/routes/(app)/dashboard/widgets", name);
    case "plugin":
      return join(root, "src/plugins", name);
  }
}

async function main() {
  const [typeArg, nameArg, outDirArg] = process.argv.slice(2);

  if (!typeArg || !nameArg) {
    console.error(
      "Usage: bun run scripts/extract-extension.ts <widget|dashboard|plugin> <name> [outputDir]",
    );
    process.exit(1);
  }

  const type = typeArg.toLowerCase() as ExtensionType;
  if (!["widget", "dashboard", "plugin"].includes(type)) {
    console.error(`Unknown extension type "${typeArg}". Expected: widget, dashboard, or plugin.`);
    process.exit(1);
  }

  const name = nameArg.trim().toLowerCase();
  const srcDir = resolveSourceDir(type, name);

  if (!existsSync(srcDir)) {
    console.error(`Source directory does not exist: ${srcDir}`);
    process.exit(1);
  }

  const outBase = outDirArg
    ? resolve(outDirArg)
    : resolve(process.cwd(), "dist/marketplace-packages");
  const targetDir = join(outBase, `${type === "dashboard" ? "dashboard-widget" : type}-${name}`);

  mkdirSync(targetDir, { recursive: true });

  console.log(`📦 Extracting ${type} "${name}"...`);
  console.log(`  Source: ${srcDir}`);
  console.log(`  Target: ${targetDir}`);

  // Copy directory contents (excluding node_modules or temp files)
  cpSync(srcDir, targetDir, {
    recursive: true,
    filter: (source) => !basename(source).startsWith(".") && !source.includes("node_modules"),
  });

  // Ensure manifest exists
  const manifestPath = join(targetDir, type === "plugin" ? "plugin.json" : "widget.json");
  let manifest: Record<string, unknown> = {};

  if (existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    } catch {
      /* ignore */
    }
  } else {
    // Generate starter manifest
    manifest = {
      id: name,
      name: name
        .split("-")
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(" "),
      version: "1.0.0",
      type: type === "dashboard" ? "dashboard-widget" : type,
      author: "SveltyCMS Community",
      license: "MIT",
      sveltycms: ">=0.1.0",
      category: type === "widget" ? "fields" : type === "dashboard" ? "diagnostics" : "utilities",
    };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
    console.log(`  + Generated manifest: ${basename(manifestPath)}`);
  }

  console.log(`✅ Extension "${name}" successfully extracted to:`);
  console.log(`   ${targetDir}\n`);
}

main().catch((err) => {
  console.error("Extraction error:", err);
  process.exit(1);
});
