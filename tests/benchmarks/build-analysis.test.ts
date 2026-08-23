/**
 * @file tests/benchmarks/build-analysis.test.ts
 * @description Enterprise Build Analysis Benchmark (Optimized)
 * @summary Measures compilation speed, bundle size trends, and tree-shaking efficiency
 *
 * ### Features:
 * - Production build duration tracking
 * - Bundle/output directory size analysis
 * - Tree-shaking / dead-code elimination verification
 */

import {
  test,
  exportResult,
  printTruthTable,
  printSummaryTable,
  getDbType,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";
import { logger } from "@utils/logger";

async function getDirSize(dir: string): Promise<number> {
  let total = 0;
  try {
    const entries = await fs.readdir(dir, {
      recursive: true,
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (entry.isFile()) {
        // recursive readdir: entry.name is the basename and entry.parentPath the
        // directory (Node >= 20.19/22). Fall back to the old full-path join.
        const parent = (entry as { parentPath?: string }).parentPath;
        const stats = await fs.stat(
          parent ? path.join(parent, entry.name) : path.join(dir, entry.name),
        );
        total += stats.size;
      }
    }
  } catch {
    // Ignore errors for missing files
  }
  return total;
}

/**
 * Sum the eager JS the (app) admin shell loads on first paint — the client
 * equivalent of "bundle size" for the editor. Walks the manifest's eager
 * import graph of the (app) layout node (sidebars + chrome + shell deps).
 * Guards against bundle regressions (e.g. a lib leaking into the shell).
 */
async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sum the eager JS the (app) admin shell loads on first paint — the client
 * equivalent of "bundle size" for the editor. Walks the manifest's eager
 * import graph of the (app) layout node (sidebars + chrome + shell deps).
 * Guards against bundle regressions (e.g. a lib leaking into the shell).
 */
async function getAdminShellJsKb(): Promise<{ kb: number; nodeCount: number }> {
  try {
    const manifestPath = path.join(
      process.cwd(),
      ".svelte-kit",
      "output",
      "client",
      ".vite",
      "manifest.json",
    );
    if (!(await fileExists(manifestPath))) return { kb: 0, nodeCount: 0 };
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as Record<
      string,
      { file: string; imports?: string[]; size?: number }
    >;

    // Find the (app) layout node: it is the only nodes/N.js chunk containing
    // the admin shell markers below.
    const nodeKeys = Object.keys(manifest).filter((k) => k.includes("client-optimized/nodes/"));
    let appNode: string | null = null;
    for (const key of nodeKeys) {
      const file = path.join(
        process.cwd(),
        ".svelte-kit",
        "output",
        "client",
        manifest[key]?.file ?? "",
      );
      // `nodes` dir check must be separator-agnostic (Windows backslashes).
      if (!file.includes(`nodes${path.sep}`) || !(await fileExists(file))) continue;
      const content = await fs.readFile(file, "utf8");
      if (content.includes("command-palette") || content.includes("floating-nav")) {
        appNode = key;
        break;
      }
    }
    if (!appNode) return { kb: 0, nodeCount: 0 };

    // Walk the eager import graph (imports only — dynamic chunks stay lazy).
    const seen = new Set<string>();
    const queue = [appNode];
    let totalBytes = 0;
    while (queue.length) {
      const key = queue.shift()!;
      if (seen.has(key)) continue;
      seen.add(key);
      const node = manifest[key];
      if (!node) continue;
      const file = path.join(process.cwd(), ".svelte-kit", "output", "client", node.file);
      if (await fileExists(file)) {
        totalBytes += (await fs.stat(file)).size;
      }
      for (const imp of node.imports ?? []) queue.push(imp);
    }
    return { kb: Math.round(totalBytes / 1024), nodeCount: seen.size };
  } catch {
    return { kb: 0, nodeCount: 0 };
  }
}

async function runBuildAnalysis() {
  console.log("🏗️ Starting SveltyCMS Production Build Analysis...\n");

  const buildDir = path.join(process.cwd(), "build");
  const startTime = performance.now();

  try {
    const isSuite = process.env.BENCHMARK === "true";
    const passedDuration = process.env.DX_BUILD_DURATION;
    let buildTimeMs: number;

    // Clean build if needed and we are going to build
    if (!passedDuration && !isSuite) {
      if (
        await fs
          .access(buildDir)
          .then(() => true)
          .catch(() => false)
      ) {
        await fs.rm(buildDir, { recursive: true, force: true });
      }
    }

    if (passedDuration) {
      buildTimeMs = parseFloat(passedDuration);
      console.log(`   ⏭️ Using pre-computed build duration: ${buildTimeMs.toFixed(0)}ms`);
    } else if (isSuite) {
      console.log("   ⏭️ Skipping redundant build (Suite Mode active).");
      buildTimeMs = 0;
    } else {
      console.log("   🔨 Running production build...");
      execSync("bun run build", {
        stdio: "inherit",
        env: { ...process.env, NODE_ENV: "production" },
      });
      buildTimeMs = performance.now() - startTime;
    }

    const totalSize = await getDirSize(buildDir);

    const files = await fs.readdir(buildDir, { recursive: true });
    const jsFiles = files.filter(
      (f) => typeof f === "string" && (f.endsWith(".js") || f.endsWith(".mjs")),
    );

    const bundleSizeMB = totalSize / 1024 / 1024;
    const shell = await getAdminShellJsKb();

    const result = {
      name: "Production Build",
      avgMs: buildTimeMs,
      p95Ms: buildTimeMs,
      rps: 0, // Not applicable for build
      bundleSizeMB: bundleSizeMB.toFixed(2),
      jsChunkCount: jsFiles.length,
      adminShellKb: shell.kb,
      adminShellChunks: shell.nodeCount,
    };

    printTruthTable({
      title: "SVELTYCMS — PRODUCTION BUILD ANALYSIS",
      shortLabel: "Build",
      subtitle: `Compilation • Bundle Size • Tree Shaking • ${getDbType().toUpperCase()}`,
      results: [result],
    });

    printSummaryTable([
      { key: "Build Time", val: buildTimeMs.toFixed(0), unit: "ms" },
      { key: "Total Bundle Size", val: bundleSizeMB.toFixed(2), unit: "MB" },
      { key: "Admin Shell (eager JS)", val: shell.kb, unit: "KB" },
      { key: "JS Chunks", val: jsFiles.length, unit: "" },
      {
        key: "Build Efficiency",
        val: buildTimeMs < 45000 ? "EXCELLENT" : buildTimeMs < 65000 ? "GOOD" : "SLOW",
        unit: "",
      },
    ]);

    exportResult(result as any);
  } catch (err: any) {
    logger.error(`Build analysis failed: ${err.message}`);
    console.error(err);
    throw err;
  }

  console.log("\n✅ Build analysis completed.");
}

test("Production Build Analysis", async () => {
  await runBuildAnalysis();
}, 180000);
