/**
 * @file scripts/fix-tailwind-build.mjs
 * @description Creates junction shims in node_modules for Vite path aliases.
 *
 * Tailwind CSS v4 registers an ESM loader hook during the SSR build. Vite's
 * resolve.alias does NOT apply through this hook, so Node's native resolver
 * treats @src/routes, @utils/logger etc. as npm scoped packages.
 *
 * Reads aliases from config/aliases.json (single source of truth shared
 * with vite.config.ts and vitest.config.ts). Creates directory symlinks
 * in node_modules/@xxx -> actual path. Runs automatically via prepare hook.
 */

import { existsSync, mkdirSync, symlinkSync, rmSync, lstatSync, realpathSync } from "node:fs";
import { resolve, dirname, join, dirname as _d } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = _d(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SHIMS_DIR = join(ROOT, "node_modules");

const aliases = JSON.parse(readFileSync(join(ROOT, "config", "aliases.json"), "utf8"));

function isSymlink(p) {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

let created = 0,
  skipped = 0;
for (const [scope, target] of Object.entries(aliases)) {
  const shimPath = join(SHIMS_DIR, scope);
  const targetPath = resolve(ROOT, target);

  if (!existsSync(targetPath)) {
    skipped++;
    continue;
  }

  if (isSymlink(shimPath)) {
    try {
      if (realpathSync(shimPath) === targetPath) {
        skipped++;
        continue;
      }
    } catch {}
  }

  if (existsSync(shimPath)) {
    try {
      rmSync(shimPath, { recursive: true, force: true });
    } catch {}
  }

  const parent = dirname(shimPath);
  if (!existsSync(parent)) mkdirSync(parent, { recursive: true });

  try {
    symlinkSync(targetPath, shimPath, "junction");
    created++;
  } catch {
    try {
      symlinkSync(targetPath, shimPath, "dir");
      created++;
    } catch {
      skipped++;
    }
  }
}
console.log(`Tailwind shims: ${created} created, ${skipped} skipped`);
