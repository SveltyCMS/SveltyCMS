/**
 * @file scripts/fix-tailwind-build.mjs
 * @description Creates junction shims in node_modules/@xxx for Vite path aliases.
 *
 * Runs with plain `node` (no bun/tsx needed) so it works regardless of package manager.
 * Called automatically by the `prepare` lifecycle hook on every install.
 *
 * Tailwind CSS v4 registers a Node.js ESM loader hook that intercepts ALL module
 * resolution during the SSR build. Vite's `resolve.alias` does NOT apply through
 * this hook. This script creates directory symlinks in `node_modules/@xxx` so
 * Node's native resolver finds path aliases as if they were npm packages.
 */

import { existsSync, mkdirSync, symlinkSync, rmSync, lstatSync, realpathSync } from "node:fs";
import { resolve, dirname, join } from "node:path";

const SHIMS_DIR = resolve(process.cwd(), "node_modules");

const ALIAS_SHIMS = {
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

function isSymlink(p) {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

function ensureShim(scope, target) {
  const shimPath = join(SHIMS_DIR, scope);
  const targetPath = resolve(process.cwd(), target);

  if (!existsSync(targetPath)) {
    console.log(`  Skipping ${scope} (target doesn't exist)`);
    return false;
  }

  if (isSymlink(shimPath)) {
    try {
      if (realpathSync(shimPath) === targetPath) return false;
    } catch {
      /* broken */
    }
  }

  if (existsSync(shimPath)) {
    try {
      rmSync(shimPath, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  const parent = dirname(shimPath);
  if (!existsSync(parent)) mkdirSync(parent, { recursive: true });

  try {
    symlinkSync(targetPath, shimPath, "junction");
    return true;
  } catch {
    try {
      symlinkSync(targetPath, shimPath, "dir");
      return true;
    } catch {
      console.log(`  Could not create junction for ${scope}`);
      return false;
    }
  }
}

let created = 0;
let skipped = 0;

for (const [scope, target] of Object.entries(ALIAS_SHIMS)) {
  if (ensureShim(scope, target)) created++;
  else skipped++;
}

console.log(`Tailwind shims: ${created} created, ${skipped} skipped/unchanged`);
