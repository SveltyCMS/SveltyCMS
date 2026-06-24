#!/usr/bin/env bun
/**
 * @file scripts/fix-tailwind-build.ts
 * @description
 * Workaround for @tailwindcss/node v4.3.1 loader hook that intercepts ALL
 * module resolution during SSR builds.
 *
 * The Tailwind CSS v4 Vite plugin registers a Node.js ESM loader hook that
 * intercepts module resolution. During `vite.config.ts` evaluation, any
 * bare specifier like `@src/routes/setup/preset-collections.server` is
 * resolved by Node's native package resolution (not Vite's alias system),
 * causing ERR_MODULE_NOT_FOUND for path aliases.
 *
 * Additionally, when Tailwind scans source files via the @src junction it
 * finds .svelte files importing SvelteKit virtual modules ($app/*) which
 * also need stubs.
 *
 * Fix:
 * 1. Create Windows junction points (or Unix symlinks) for all @-prefixed
 *    aliases, mapping node_modules/<alias> → actual source directory.
 * 2. Create no-op stub packages for SvelteKit virtual modules ($app/*,
 *    $env/*, etc.) that the Tailwind scanner encounters transitively.
 *
 * On Windows, junction points do NOT require elevated privileges (unlike
 * symlinks), making this safe for CI and developer machines.
 *
 * Usage: bun run scripts/fix-tailwind-build.ts  (run once, before build)
 * Auto-run: wired as prebuild via package.json scripts.
 */

import { mkdirSync, writeFileSync, existsSync, rmSync, symlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { platform } from "node:os";

const ROOT = process.cwd();
const SHIMS_ROOT = join(ROOT, "node_modules");
const IS_WINDOWS = platform() === "win32";

// ── 1. Junction / Symlink shims for path aliases ─────────────────────────────

/**
 * All path aliases defined in vite.config.ts `alias` block + SvelteKit config.
 * Keep in sync with the alias block in vite.config.ts.
 */
const ALIAS_MAP: Record<string, { target: string; main?: string }> = {
  "@src": { target: "src", main: "src/hooks.server.ts" },
  "@root": { target: ".", main: "package.json" },
  "@config": { target: "config", main: "config/private.ts" },
  "@api": { target: "src/routes/api" },
  "@auth": { target: "src/databases/auth" },
  "@collections": { target: "config/collections" },
  "@components": { target: "src/components" },
  "@content": { target: "src/content" },
  "@databases": { target: "src/databases" },
  "@hooks": { target: "src/hooks" },
  "@plugins": { target: "src/plugins" },
  "@services": { target: "src/services" },
  "@static": { target: "static" },
  "@stores": { target: "src/stores" },
  "@themes": { target: "src/themes" },
  "@types": { target: "src/types" },
  "@utils": { target: "src/utils" },
  "@widgets": { target: "src/widgets" },
  "@tests": { target: "tests" },
};

// ── 2. Virtual module stubs ───────────────────────────────────────────────────

/**
 * SvelteKit / Vite virtual modules that don't exist as real npm packages.
 * These need stub package.json + entry files so Node can resolve them when
 * Tailwind's loader hook encounters them transitively through source files.
 *
 * Maps: package-name → { subpaths: [list of sub-module paths to stub] }
 */
const VIRTUAL_STUBS: Record<string, { subpaths: string[]; exports?: string }> = {
  $app: {
    subpaths: ["environment", "navigation", "forms", "state", "paths", "stores"],
    exports: `export const browser = false; export const dev = false; export const building = true; export const version = ''; export const page = {}; export const navigating = null; export const updated = { current: false, check: async () => false }; export async function goto() {}; export async function invalidate() {}; export async function invalidateAll() {}; export async function preloadData() {}; export async function preloadCode() {}; export function beforeNavigate() {}; export function afterNavigate() {}; export function onNavigate() {}; export function enhance() { return () => {}; }; export const getStores = () => ({ page: { subscribe: () => () => {} }, navigating: { subscribe: () => () => {} }, updated: { subscribe: () => () => {} } }); export const PUBLIC_BASE_PATH = '/';`,
  },
  $env: {
    subpaths: ["dynamic/private", "dynamic/public", "static/private", "static/public"],
    exports: `export const env = {}; export const PUBLIC = {}; export const PRIVATE = {};`,
  },
  $paraglide: {
    subpaths: ["runtime"],
    exports: `export const languageTag = () => 'en'; export const setLanguageTag = () => {}; export const sourceLanguageTag = 'en'; export const availableLanguageTags = ['en']; export function i18n() { return {}; }`,
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function removeExisting(dirPath: string): void {
  if (!existsSync(dirPath)) return;
  try {
    rmSync(dirPath, { recursive: true, force: true });
  } catch {
    // Ignore — will fail at creation if still present
  }
}

function ensureParent(dirPath: string): void {
  const parent = join(dirPath, "..");
  if (!existsSync(parent)) {
    mkdirSync(parent, { recursive: true });
  }
}

/**
 * Creates a junction (Windows) or symlink (Unix) from aliasDir → targetAbs.
 * Falls back to writing a package.json stub if junction fails.
 */
function createJunction(aliasDir: string, targetAbs: string, label: string): boolean {
  ensureParent(aliasDir);
  removeExisting(aliasDir);

  try {
    const type = IS_WINDOWS ? "junction" : "dir";
    symlinkSync(targetAbs, aliasDir, type);
    return true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`   ⚠️  Junction failed for ${label}: ${msg}`);
    return false;
  }
}

/**
 * Creates a stub package directory with package.json + index.js exports.
 */
function createStub(stubDir: string, name: string, exports: string): void {
  mkdirSync(stubDir, { recursive: true });
  writeFileSync(
    join(stubDir, "package.json"),
    JSON.stringify(
      {
        name,
        version: "0.0.0",
        private: true,
        type: "module",
        main: "./index.js",
        exports: { ".": "./index.js", "./*": "./*.js" },
      },
      null,
      2,
    ) + "\n",
  );
  writeFileSync(join(stubDir, "index.js"), exports + "\n");
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log("🔧 Creating Tailwind v4 build shims...\n");

// 1. Junction shims for @ path aliases
console.log("  📁 Path alias junctions:");
let junctionOk = 0,
  junctionFallback = 0;

for (const [alias, { target, main }] of Object.entries(ALIAS_MAP)) {
  const aliasDir = join(SHIMS_ROOT, alias);
  const targetAbs = resolve(ROOT, target);
  const ok = createJunction(aliasDir, targetAbs, alias);
  if (ok) {
    junctionOk++;
    console.log(`     ✅ ${alias} → ${target} [${IS_WINDOWS ? "junction" : "symlink"}]`);
  } else {
    junctionFallback++;
    // Fallback: write a minimal package.json stub
    mkdirSync(aliasDir, { recursive: true });
    const pkg: Record<string, unknown> = {
      name: alias,
      version: "0.0.0",
      private: true,
      type: "module",
    };
    if (main) pkg.main = `../../${main}`;
    writeFileSync(join(aliasDir, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
    console.log(`     ⚠️  ${alias} → ${target} [stub - deep imports may fail]`);
  }
}

// 2. Virtual module stubs ($app, $env, etc.)
console.log("\n  🔌 Virtual module stubs:");

for (const [pkgName, { subpaths, exports: exportsCode }] of Object.entries(VIRTUAL_STUBS)) {
  const exports = exportsCode ?? "export default {};";
  const pkgDir = join(SHIMS_ROOT, pkgName);

  // Create the root package stub
  createStub(pkgDir, pkgName, exports);
  console.log(`     ✅ ${pkgName} [stub]`);

  // Create sub-path stubs (e.g. $app/environment, $app/navigation)
  for (const sub of subpaths) {
    const subDir = join(pkgDir, sub);
    mkdirSync(subDir, { recursive: true });
    writeFileSync(join(subDir, "index.js"), exports + "\n");
    // Also write as a .js file alongside for direct file resolution
    writeFileSync(join(pkgDir, `${sub}.js`), exports + "\n");
  }
}

console.log(`
📦 Shims complete: ${junctionOk} junctions, ${junctionFallback} stubs, ${Object.keys(VIRTUAL_STUBS).length} virtual stubs
   Tailwind v4 loader can now resolve @src/*, @utils/*, @stores/*, $app/*, etc.
`);
