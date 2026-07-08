/**
 * @file scripts/fix-tailwind-build.mjs
 * @description Creates junction shims in node_modules for Vite path aliases.
 *
 * WHY THIS EXISTS:
 *
 * @tailwindcss/node (dependency of @tailwindcss/vite) ships an ESM customization
 * hook (dist/esm-cache.loader.mjs) that wraps Node's global module resolver via
 * `module.register()`. This hook runs BEFORE Vite's `resolve.alias`, so any
 * `@src/...` or `@utils/...` import is treated as an npm scoped package by
 * Node's native resolver and fails with ERR_MODULE_NOT_FOUND.
 *
 * Our vite.config.ts has a complex evaluation chain (10+ custom plugins,
 * vitest/config import, dynamic imports) that triggers module resolution
 * through Tailwind's hook during config processing. Simple SvelteKit setups
 * don't hit this because their config evaluation doesn't reach the hook.
 *
 * `package.json` "imports" field can't fix this — Node needs explicit .ts
 * extensions but the imports map drops them. The shim works because it creates
 * actual filesystem entries (node_modules/@utils -> src/utils/) that Node's
 * native resolver finds before treating the import as a package lookup.
 *
 * Reads aliases from config/aliases.json (shared with vite/vitest configs).
 * Runs automatically via the "prepare" lifecycle hook on every install.
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
  try { return lstatSync(p).isSymbolicLink(); } catch { return false; }
}

let created = 0, skipped = 0;
for (const [scope, target] of Object.entries(aliases)) {
  const shimPath = join(SHIMS_DIR, scope);
  const targetPath = resolve(ROOT, target);

  if (!existsSync(targetPath)) { skipped++; continue; }

  if (isSymlink(shimPath)) {
    try { if (realpathSync(shimPath) === targetPath) { skipped++; continue; } } catch {}
  }

  if (existsSync(shimPath)) {
    try { rmSync(shimPath, { recursive: true, force: true }); } catch {}
  }

  const parent = dirname(shimPath);
  if (!existsSync(parent)) mkdirSync(parent, { recursive: true });

  try { symlinkSync(targetPath, shimPath, "junction"); created++; } catch {
    try { symlinkSync(targetPath, shimPath, "dir"); created++; } catch {
      skipped++;
    }
  }
}
console.log(`Tailwind shims: ${created} created, ${skipped} skipped`);
