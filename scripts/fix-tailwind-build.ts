#!/usr/bin/env bun
/**
 * @file scripts/fix-tailwind-build.ts
 * @description Creates junction points for @-prefixed aliases so
 * @tailwindcss/node's ESM loader can resolve Vite path aliases natively.
 * Usage: bun run scripts/fix-tailwind-build.ts (run once before build)
 */

import { mkdirSync, writeFileSync, existsSync, rmSync, symlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { platform } from "node:os";

const ROOT = process.cwd();
const SHIMS_ROOT = join(ROOT, "node_modules");
const IS_WINDOWS = platform() === "win32";

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

function removeExisting(dirPath: string): void {
  if (!existsSync(dirPath)) return;
  try {
    rmSync(dirPath, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

function ensureParent(dirPath: string): void {
  const parent = join(dirPath, "..");
  if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
}

function createJunction(aliasDir: string, targetAbs: string, label: string): boolean {
  ensureParent(aliasDir);
  removeExisting(aliasDir);
  try {
    symlinkSync(targetAbs, aliasDir, IS_WINDOWS ? "junction" : "dir");
    return true;
  } catch {
    return false;
  }
}

console.log("🔧 Creating Tailwind build shims...\n");

let ok = 0,
  fallback = 0;
for (const [alias, { target, main }] of Object.entries(ALIAS_MAP)) {
  const aliasDir = join(SHIMS_ROOT, alias);
  const targetAbs = resolve(ROOT, target);
  if (createJunction(aliasDir, targetAbs, alias)) {
    ok++;
    console.log(`   ✅ ${alias} → ${target}`);
  } else {
    fallback++;
    mkdirSync(aliasDir, { recursive: true });
    const pkg: Record<string, unknown> = {
      name: alias,
      version: "0.0.0",
      private: true,
      type: "module",
    };
    if (main) pkg.main = `../../${main}`;
    writeFileSync(join(aliasDir, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
    console.log(`   ⚠️  ${alias} → ${target} [stub]`);
  }
}

// Virtual module stubs
const VIRTUAL_STUBS: Record<string, { subpaths: string[]; code: string }> = {
  $app: {
    subpaths: ["environment", "navigation", "forms", "state", "paths", "stores"],
    code: "export const browser=false;export const dev=false;export const building=true;export const page={};export const navigating=null;export const updated={current:false,check:async()=>false};export async function goto(){};export async function invalidate(){};export async function invalidateAll(){};export async function preloadData(){};export async function preloadCode(){};export function beforeNavigate(){};export function afterNavigate(){};export function onNavigate(){};export function enhance(){return()=>{};};export const getStores=()=>({});",
  },
  $env: {
    subpaths: ["dynamic/private", "dynamic/public", "static/private", "static/public"],
    code: "export const env = {};",
  },
};

console.log("🔌 Creating virtual module stubs...");
for (const [pkgName, { subpaths, code }] of Object.entries(VIRTUAL_STUBS)) {
  const pkgDir = join(SHIMS_ROOT, pkgName);
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(
    join(pkgDir, "package.json"),
    JSON.stringify(
      {
        name: pkgName,
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
  writeFileSync(join(pkgDir, "index.js"), code + "\n");
  for (const sub of subpaths) {
    const subDir = join(pkgDir, sub);
    mkdirSync(subDir, { recursive: true });
    writeFileSync(join(subDir, "index.js"), code + "\n");
    writeFileSync(join(pkgDir, `${sub}.js`), code + "\n");
  }
  console.log(`   ✅ ${pkgName} [${subpaths.length} subpaths]`);
}

console.log(
  `\n📦 Done: ${ok} junctions, ${fallback} stubs, ${Object.keys(VIRTUAL_STUBS).length} virtual stubs\n`,
);
