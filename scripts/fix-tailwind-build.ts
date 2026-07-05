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
 * The shims are gitignored and recreated on each build by the prepare lifecycle.
 *
 * Usage:
 *   bun run scripts/fix-tailwind-build.ts
 *   # Called automatically by `bun run prepare` before every build.
 */

import { existsSync, mkdirSync, symlinkSync, rmSync, lstatSync, unlinkSync } from "node:fs";
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
  // SvelteKit internal virtual modules — Tailwind's loader hook can't resolve them
  $app: "node_modules/@sveltejs/kit/src/runtime/app",
};

function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

function ensureShim(scope: string, target: string): boolean {
  const shimPath = join(SHIMS_DIR, scope);
  const targetPath = resolve(process.cwd(), target);

  if (!existsSync(targetPath)) {
    console.log(`  ⚠️  Skipping ${scope} → ${target} (target doesn't exist)`);
    return false;
  }

  // Already correct
  if (isSymlink(shimPath)) {
    try {
      const current = require("node:fs").realpathSync(shimPath);
      if (current === targetPath) return false; // already correct
      try {
        unlinkSync(shimPath);
      } catch {
        rmSync(shimPath, { force: true });
      }
    } catch {
      try {
        unlinkSync(shimPath);
      } catch {
        rmSync(shimPath, { force: true });
      }
    }
  } else if (existsSync(shimPath)) {
    // Not a symlink — remove it
    try {
      rmSync(shimPath, { recursive: true, force: true });
    } catch {
      try {
        unlinkSync(shimPath);
      } catch {
        // ignore
      }
    }
  }

  // Ensure parent directory exists
  const parent = dirname(shimPath);
  if (!existsSync(parent)) {
    mkdirSync(parent, { recursive: true });
  }

  try {
    symlinkSync(targetPath, shimPath, "junction");
    return true;
  } catch {
    // Fallback: try dir junction on Windows
    try {
      symlinkSync(targetPath, shimPath, "dir");
      return true;
    } catch {
      console.log(`  ⚠️  Could not create junction for ${scope}`);
      return false;
    }
  }
}

function main() {
  console.log("🔧 Fixing Tailwind build resolution (junction shims)...");

  let created = 0;
  let skipped = 0;

  for (const [scope, target] of Object.entries(ALIAS_SHIMS)) {
    if (ensureShim(scope, target)) {
      created++;
    } else {
      skipped++;
    }
  }

  console.log(`✅ Created ${created} junction shims (${skipped} skipped/unchanged)`);
}

main();
