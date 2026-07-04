#!/usr/bin/env bun
/**
 * @file scripts/build-packages.ts
 * @description
 * Build pipeline for @sveltycms/* workspace packages.
 *
 * For each package under packages/:
 * 1. Type-checks the re-export barrel files (tsc --noEmit)
 * 2. Bundles with esbuild for publishable ESM output
 *
 * Usage:
 *   bun run scripts/build-packages.ts              # Full build
 *   bun run scripts/build-packages.ts --check       # Type-check only
 *   bun run scripts/build-packages.ts --pkg=core    # Single package
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";

const ROOT = resolve(import.meta.dirname!, "..");
const PACKAGES_DIR = join(ROOT, "packages");
const IS_WINDOWS = process.platform === "win32";

interface PackageInfo {
  name: string;
  dir: string;
  pkg: any;
}

function getPackages(singlePkg?: string): PackageInfo[] {
  if (!existsSync(PACKAGES_DIR)) {
    console.error("\u274c packages/ directory not found");
    process.exit(1);
  }

  const dirs = readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  if (singlePkg) {
    if (!dirs.includes(singlePkg)) {
      console.error(`\u274c Package "${singlePkg}" not found in packages/`);
      process.exit(1);
    }
    return [loadPackage(singlePkg)];
  }

  return dirs.map(loadPackage);
}

function loadPackage(dir: string): PackageInfo {
  const pkgDir = join(PACKAGES_DIR, dir);
  const pkgJson = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf-8"));
  return { name: pkgJson.name, dir: pkgDir, pkg: pkgJson };
}

function runCmd(cmd: string, args: string[], cwd: string): boolean {
  console.log(`   $ ${cmd} ${args.join(" ")}`);
  try {
    execSync([cmd, ...args].join(" "), {
      cwd,
      stdio: "inherit",
      shell: IS_WINDOWS,
    });
    return true;
  } catch {
    return false;
  }
}

async function buildPackage(info: PackageInfo, checkOnly: boolean): Promise<boolean> {
  console.log(`\n\ud83d\udce6 Building ${info.name}...`);

  const distDir = join(info.dir, "dist");

  if (!checkOnly) {
    if (existsSync(distDir)) rmSync(distDir, { recursive: true, force: true });
    mkdirSync(distDir, { recursive: true });
  }

  // Step 1: Type-check
  console.log(`   \ud83d\udd0d Type-checking ${info.name}...`);
  const tscOk = runCmd("bun", ["x", "tsc", "--project", "tsconfig.json", "--noEmit"], info.dir);
  if (!tscOk) {
    console.error(`   \u274c ${info.name}: Type check failed`);
    return false;
  }
  console.log(`   \u2705 ${info.name}: Types OK`);

  if (checkOnly) return true;

  // Step 2: Bundle with esbuild for each entry point
  const exports = info.pkg.exports || {};
  for (const [exportPath, conditions] of Object.entries(exports) as [string, any][]) {
    const entryFile = conditions?.import || conditions?.default;
    if (!entryFile) continue;

    const entrySrc = join(info.dir, entryFile);
    if (!existsSync(entrySrc)) {
      console.warn(`   \u26a0\ufe0f  Entry not found: ${entryFile}`);
      continue;
    }

    const outName =
      exportPath === "." ? "index" : exportPath.replace(/^\.\//, "").replace(/\//g, "-");
    const outFile = join(distDir, `${outName}.js`);

    console.log(`   \ud83d\udce6 Bundling ${exportPath} \u2192 dist/${outName}.js`);

    const esbuildOk = runCmd(
      "bun",
      [
        "x",
        "esbuild",
        entryFile,
        "--bundle",
        `--outfile=${outFile}`,
        "--format=esm",
        "--platform=neutral",
        "--target=esnext",
        "--external:@sveltycms/*",
        "--external:svelte",
        "--external:valibot",
        "--external:typescript",
      ],
      info.dir,
    );

    if (!esbuildOk) {
      console.error(`   \u274c ${info.name}: Bundle failed for ${exportPath}`);
      return false;
    }
  }

  // Step 3: Copy static files
  for (const file of ["README.md", "package.json"]) {
    const src = join(info.dir, file);
    if (existsSync(src)) {
      writeFileSync(join(distDir, file), readFileSync(src));
    }
  }

  console.log(`   \u2705 ${info.name}: Build complete`);
  return true;
}

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const singlePkgArg = args.find((a) => a.startsWith("--pkg="));
  const singlePkg = singlePkgArg?.slice("--pkg=".length);

  const packages = getPackages(singlePkg);
  console.log(`\n\ud83d\ude80 Building ${packages.length} package(s)...\n`);

  let failed = 0;
  for (const pkg of packages) {
    const ok = await buildPackage(pkg, checkOnly);
    if (!ok) failed++;
  }

  if (failed > 0) {
    console.error(`\n\u274c ${failed} package(s) failed`);
    process.exit(1);
  }

  console.log(`\n\u2705 All ${packages.length} package(s) built successfully\n`);
}

main().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
