/**
 * @file scripts/fix-tailwind-build.ts
 * @description Creates junction shims in node_modules/@xxx for Vite path aliases.
 *
 * Tailwind CSS v4 registers a Node.js ESM loader hook that intercepts ALL module
 * resolution during the SSR build. Vite's `resolve.alias` does NOT apply through
 * this hook. When Tailwind encounters `import("@src/routes/setup/...")` in
 * server-only TypeScript files, Node's native resolver treats `@src/routes` as
 * an npm scoped package and fails with ERR_MODULE_NOT_FOUND.
 *
 * The `@source` feature (CSS file globs) limits which files Tailwind *scans for
 * classes*, but the loader hook still intercepts ALL module resolution regardless.
 *
 * This script creates junction points (directory symlinks on Windows, symlinks
 * on Unix) in `node_modules/@xxx` → `actual/path`, making Node's native resolver
 * find these "packages" successfully.
 *
 * The shims are gitignored and recreated on each install by the prepare lifecycle.
 *
 * Usage:
 *   bun run scripts/fix-tailwind-build.ts
 */

import { existsSync, mkdirSync, symlinkSync, rmSync, lstatSync, realpathSync } from "node:fs";
import { resolve, dirname, join } from "node:path";

const SHIMS_DIR = resolve(process.cwd(), "node_modules");

// Map of @scope → target directory (relative to project root)
const ALIAS_SHIMS: Record<string, string> = {
  "@src": "src",
  "@utils": "src/utils",
  "@components": "src/components",
  "@databases": "src/databases",
  "@services": "src/services",
  "@stores": "src/stores",
  "@widgets": "src/widgets",
  "@config": "config",
  "@content": "src/content",
  "@hooks": "src/hooks",
  "@themes": "src/themes",
  "@plugins": "src/plugins",
  "@api": "src/routes/api",
  "@auth": "src/databases/auth",
  "@collections": "config/collections",
  "@root": ".",
  "@static": "static",
  "@types": "src/types",
  "@tests": "tests",
  $paraglide: "src/paraglide",
};

function isSymlink(p: string): boolean {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

function ensureShim(scope: string, target: string): boolean {
  const shimPath = join(SHIMS_DIR, scope);
  const targetPath = resolve(process.cwd(), target);

  if (!existsSync(targetPath)) {
    console.log(`  \u26A0\uFE0F  Skipping ${scope} \u2192 ${target} (target doesn't exist)`);
    return false;
  }

  // Already a correct symlink — nothing to do
  if (isSymlink(shimPath)) {
    try {
      if (realpathSync(shimPath) === targetPath) return false;
    } catch {
      // Broken symlink — will recreate below
    }
  }

  // Remove existing shim if present (rmSync can fail on Windows junctions — ignore)
  if (existsSync(shimPath)) {
    try {
      rmSync(shimPath, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  // Ensure parent directory exists
  const parent = dirname(shimPath);
  if (!existsSync(parent)) {
    mkdirSync(parent, { recursive: true });
  }

  // Create the junction (Windows: "junction", Unix: "dir")
  try {
    symlinkSync(targetPath, shimPath, "junction");
    return true;
  } catch {
    try {
      symlinkSync(targetPath, shimPath, "dir");
      return true;
    } catch {
      console.log(`  \u26A0\uFE0F  Could not create junction for ${scope}`);
      return false;
    }
  }
}

function main() {
  console.log("\uD83D\uDD27 Fixing Tailwind build resolution (junction shims)...");

  let created = 0;
  let skipped = 0;

  for (const [scope, target] of Object.entries(ALIAS_SHIMS)) {
    if (ensureShim(scope, target)) {
      created++;
    } else {
      skipped++;
    }
  }

  console.log(`\u2705 Created ${created} junction shims (${skipped} skipped/unchanged)`);
}

main();
