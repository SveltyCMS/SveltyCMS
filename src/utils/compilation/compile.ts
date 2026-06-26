/**
 * @file src/utils/compilation/compile.ts
 * @description Compiles TypeScript files from the collections folder into JavaScript files using the TypeScript compiler with custom AST transformations
 */

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import * as ts from "typescript";
import os from "node:os";
import { isValidTenantId } from "../tenant.ts";
import {
  addJsExtensionTransformer,
  aliasResolverTransformer,
  commonjsToEsModuleTransformer,
  schemaTransformer,
  widgetTransformer,
} from "./transformers.ts";
import type { CompilationResult, CompileOptions, Logger, ManifestEntry } from "./types";
const defaultLogger: Logger = {
  info: (msg) => console.log(`\x1b[34m[Compile]\x1b[0m ${msg}`),
  success: (msg) => console.log(`\x1b[34m[Compile]\x1b[0m \x1b[32m${msg}\x1b[0m`),
  warn: (msg) => console.warn(`\x1b[34m[Compile]\x1b[0m \x1b[33m${msg}\x1b[0m`),
  error: (msg, err) => console.error(`\x1b[34m[Compile]\x1b[0m \x1b[31m${msg}\x1b[0m`, err),
};

/**
 * Core compilation function.
 * Orchestrates the transformation of TS/JS collection files into optimized JS.
 */
export async function compile(options: CompileOptions = {}): Promise<CompilationResult> {
  const startTime = Date.now();
  const logger = options.logger || defaultLogger;

  if (options.tenantId !== undefined && !isValidTenantId(options.tenantId)) {
    throw new Error(`Invalid tenant ID: ${options.tenantId}`);
  }

  const { getCollectionsPath, getCompiledCollectionsPath } = await import("../tenant.server");
  const userCollections = options.userCollections || getCollectionsPath(options.tenantId);
  const compiledCollections =
    options.compiledCollections || getCompiledCollectionsPath(options.tenantId);

  // Adaptive concurrency: 75% of cores, min 4
  const concurrencyLimit = options.concurrency || Math.max(4, Math.floor(os.cpus().length * 0.75));

  const result: CompilationResult = {
    processed: 0,
    skipped: 0,
    errors: [],
    duration: 0,
    orphanedFiles: [],
    schemaWarnings: [],
  };

  try {
    // 1. Ensure directories exist
    await fs.mkdir(userCollections, { recursive: true });
    await fs.mkdir(compiledCollections, { recursive: true });

    // 2. Load compilation manifest for high-speed change detection
    const manifest = await loadManifest(compiledCollections);
    let sourceFiles = await getTypescriptAndJavascriptFiles(userCollections);

    // Outside benchmark runtime, never compile test/ fixtures into the live tree
    // NOTE: inlined from preset-collections.server.ts to avoid @src/ alias at Node.js level
    // during Vite config initialization (before Vite's resolver is active).
    const isBenchmarkRuntime = (): boolean =>
      [
        "BENCHMARK",
        "BENCHMARK_MODE",
        "BENCHMARK_STABLE",
        "SVELTY_BENCHMARK_SUITE",
        "TEST_MODE",
      ].some((k) => process.env[k] === "true") || process.env.BENCHMARK_MODE === "1";
    const isBenchmarkArtifact = (fileName: string): boolean => {
      const base = fileName.replace(/\.(ts|js)$/, "");
      const lower = base.toLowerCase();
      return (
        base.includes("Mock Collection") ||
        lower.startsWith("bench_") ||
        lower.startsWith("benchmark_") ||
        lower === "benchmarkstable" ||
        base.startsWith("BenchmarkStable") ||
        lower.startsWith("mock-collection") ||
        lower.startsWith("mock_") ||
        lower.startsWith("mock-") ||
        lower.startsWith("stress_") ||
        lower.startsWith("stress-")
      );
    };
    const { isBenchmarkRelativePath } = await import("../benchmark-paths");
    if (!isBenchmarkRuntime()) {
      sourceFiles = sourceFiles.filter((relativePath) => {
        if (isBenchmarkRelativePath(relativePath)) return false;
        return !isBenchmarkArtifact(path.basename(relativePath));
      });
    }

    await createOutputDirectories(sourceFiles, compiledCollections);

    const processedJsPaths = new Set<string>();
    const queue = [...sourceFiles];

    // 3. Worker logic (Concurrent execution)
    const worker = async () => {
      while (queue.length > 0) {
        const relativePath = queue.shift();
        if (!relativePath) break;

        // Optional: Filter by specific target file
        if (options.targetFile) {
          const normalizedTarget = path.normalize(options.targetFile);
          const normalizedFile = path.normalize(path.join(userCollections, relativePath));
          if (
            !(normalizedFile.endsWith(normalizedTarget) || normalizedTarget.endsWith(relativePath))
          ) {
            continue;
          }
        }

        const sourcePath = path.join(userCollections, relativePath);
        const relativeDir = path.dirname(relativePath);
        const fileNameWithoutExt = path.basename(relativePath, path.extname(relativePath));
        const targetPath = path.join(compiledCollections, relativeDir, `${fileNameWithoutExt}.js`);

        try {
          const content = await fs.readFile(sourcePath, "utf8");
          const sourceHash = createHash("md5").update(content).digest("hex");

          // High-speed skip check: Hash + Tenant consistency
          const existing = manifest.get(targetPath);
          if (existing?.sourceHash === sourceHash && existing?.tenantId === options.tenantId) {
            result.skipped++;
            processedJsPaths.add(targetPath);
            continue;
          }

          // 4. Transform & Compile
          const compilerOptions: ts.CompilerOptions = {
            target: ts.ScriptTarget.ESNext,
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.NodeJs,
            allowJs: true,
            checkJs: false,
            skipLibCheck: true,
            esModuleInterop: true,
          };

          const transformers: ts.CustomTransformers = {
            before: [
              aliasResolverTransformer,
              widgetTransformer,
              schemaTransformer(options.tenantId),
              commonjsToEsModuleTransformer,
              addJsExtensionTransformer,
            ],
          };

          const compilation = ts.transpileModule(content, {
            compilerOptions,
            transformers,
            fileName: sourcePath,
          });

          await fs.writeFile(targetPath, compilation.outputText);

          // Update manifest for persistence
          manifest.set(targetPath, {
            sourcePath: relativePath,
            sourceHash,
            compiledAt: Date.now(),
            tenantId: options.tenantId || undefined,
          });

          result.processed++;
          processedJsPaths.add(targetPath);
          logger.info(`Compiled ${relativePath}`);
        } catch (err: any) {
          result.errors.push({ file: relativePath, error: err });
          logger.error(`Failed to compile ${relativePath}`, err);
        }
      }
    };

    // Spawn workers
    const workers = Array.from({ length: Math.min(concurrencyLimit, sourceFiles.length) }, worker);
    await Promise.all(workers);

    // 5. Cleanup orphaned files (only in full build runs)
    if (!options.targetFile) {
      for (const [jsPath] of manifest) {
        if (!processedJsPaths.has(jsPath)) {
          await fs.unlink(jsPath).catch(() => {
            logger.warn("Failed to unlink orphaned compiled file");
          });
          result.orphanedFiles.push(jsPath);
          manifest.delete(jsPath);
        }
      }
    }

    // 6. Save manifest for next run
    await saveManifest(compiledCollections, manifest);

    result.duration = Date.now() - startTime;
    logger.success?.(
      `Compilation completed: ${result.processed} processed, ${result.skipped} skipped, ${result.orphanedFiles.length} orphaned`,
    );

    return result;
  } catch (error: any) {
    logger.error("Compilation failed", error);
    throw error;
  }
}

/**
 * Loads the compilation manifest from the output directory.
 * Provides O(1) change detection lookup.
 */
async function loadManifest(dir: string): Promise<Map<string, ManifestEntry>> {
  const manifestPath = path.join(dir, ".compilation-manifest.json");
  try {
    const data = await fs.readFile(manifestPath, "utf8");
    return new Map(Object.entries(JSON.parse(data)));
  } catch {
    return new Map();
  }
}

/**
 * Persists the compilation manifest to disk.
 */
async function saveManifest(dir: string, manifest: Map<string, ManifestEntry>) {
  const manifestPath = path.join(dir, ".compilation-manifest.json");
  await fs.writeFile(manifestPath, JSON.stringify(Object.fromEntries(manifest), null, 2));
}

async function getTypescriptAndJavascriptFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(currentDir: string) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".js"))) {
        files.push(path.relative(dir, fullPath));
      }
    }
  }

  await walk(dir);
  return files;
}

async function createOutputDirectories(files: string[], baseDir: string) {
  const dirs = new Set(files.map((f) => path.dirname(path.join(baseDir, f))));
  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true });
  }
}
