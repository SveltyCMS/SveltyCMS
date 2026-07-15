/**
 * @file src/utils/compilation/compile.ts
 * @description Compiles TypeScript collection files into optimized JavaScript.
 *
 * Performance design:
 * - Single-pass composite transformer (5 AST traversals → 1)
 * - O(1) queue via index cursor, not O(n) shift()
 * - Batch hash resolution via Promise.all
 * - Static imports for benchmark guards (no lazy dynamic imports)
 * - Adaptive concurrency: 75% of cores, min 4
 * - Orphan file + empty directory cleanup on full builds
 */

import { xxhash64 } from "hash-wasm";
import fs from "node:fs/promises";
import path from "node:path";
import * as ts from "typescript";
import os from "node:os";
import { isValidTenantId } from "../tenant.ts";
import { getCollectionsPath, getCompiledCollectionsPath } from "../tenant.server.ts";
import { isBenchmarkArtifact, isBenchmarkRuntime } from "../benchmark-runtime.ts";
import { isBenchmarkRelativePath } from "../benchmark-paths.ts";
import { assertLiveDataWriteAllowed } from "../benchmark-sandbox.ts";
import { createCompositeTransformer } from "./transformers.ts";
import type { CompilationResult, CompileOptions, Logger, ManifestEntry } from "./types";

// ─── Manifest metadata keys ───────────────────────────────────────────
const MANIFEST_ORDER_KEY = "collectionOrder";
const MANIFEST_STRUCTURE_KEY = "structureNodes";

interface LoadedManifest {
  collectionOrder?: Record<string, number>;
  structureNodes?: unknown[];
  entries: Map<string, ManifestEntry>;
}

// ─── Logger ────────────────────────────────────────────────────────────
const defaultLogger: Logger = {
  info: (msg) => console.log(`\x1b[34m[Compile]\x1b[0m ${msg}`),
  success: (msg) => console.log(`\x1b[34m[Compile]\x1b[0m \x1b[32m${msg}\x1b[0m`),
  warn: (msg) => console.warn(`\x1b[34m[Compile]\x1b[0m \x1b[33m${msg}\x1b[0m`),
  error: (msg, err) => console.error(`\x1b[34m[Compile]\x1b[0m \x1b[31m${msg}\x1b[0m`, err),
};

// ─── Normalize manifest paths (Windows-safe) ──────────────────────────
function normalizeCompiledJsPath(compiledDir: string, jsPath: string): string {
  const resolvedDir = path.resolve(compiledDir);
  if (path.isAbsolute(jsPath)) return path.normalize(jsPath);

  // Handle paths that already contain the compiledCollections directory name
  // e.g., ".compiledCollections/demo.js" when compiledDir is also ".compiledCollections"
  const normalized = jsPath.replace(/\\/g, "/");
  const compiledDirName = path.basename(resolvedDir);
  const prefixPattern = new RegExp(`^\\.?/?${compiledDirName}/`);
  const relativeInsideCompiled = normalized.replace(prefixPattern, "");

  if (relativeInsideCompiled !== normalized) {
    return path.resolve(resolvedDir, relativeInsideCompiled.replace(/\//g, path.sep));
  }

  return path.resolve(resolvedDir, jsPath);
}

// ─── Manifest entry type guard ────────────────────────────────────────
function isManifestEntry(value: unknown): value is ManifestEntry {
  return (
    typeof value === "object" &&
    value !== null &&
    "sourcePath" in value &&
    "sourceHash" in value &&
    typeof (value as ManifestEntry).sourcePath === "string" &&
    typeof (value as ManifestEntry).sourceHash === "string"
  );
}

/**
 * Core compilation function.
 */
export async function compile(options: CompileOptions = {}): Promise<CompilationResult> {
  const startTime = Date.now();
  const logger = options.logger || defaultLogger;

  if (options.tenantId !== undefined && !isValidTenantId(options.tenantId)) {
    throw new Error(`Invalid tenant ID: ${options.tenantId}`);
  }

  // Resolve paths — with tenant-aware fallback
  // When a tenantId is provided, first check the tenant-scoped path.
  // If no source files exist there, fall back to flat config/collections/
  // to support non-migrated installations.
  let userCollections = path.resolve(
    options.userCollections || getCollectionsPath(options.tenantId),
  );
  let compiledCollections = path.resolve(
    options.compiledCollections || getCompiledCollectionsPath(options.tenantId),
  );

  // Smart fallback: bi-directional — handles both single→multi and multi→single transitions
  // When a tenantId is provided but tenant path is empty, fall back to flat config/collections/
  if (options.tenantId !== undefined && !options.userCollections) {
    try {
      const entries = await fs.readdir(userCollections, { withFileTypes: true });
      const hasTsFiles = entries.some((e) => e.isFile() && e.name.endsWith(".ts"));
      if (!hasTsFiles) {
        const flatCollections = path.resolve(getCollectionsPath(undefined));
        const flatEntries = await fs
          .readdir(flatCollections, { withFileTypes: true })
          .catch(() => []);
        if (flatEntries.some((e) => e.isFile() && e.name.endsWith(".ts"))) {
          logger.warn(
            `[Compile] ⚠️  Multi-tenant mode: tenant path empty, falling back to flat ${flatCollections}`,
          );
          logger.warn(
            `[Compile] ⚠️  Run migration to move collections to config/${options.tenantId}/collections/`,
          );
          userCollections = flatCollections;
          compiledCollections = path.resolve(
            options.compiledCollections || getCompiledCollectionsPath(options.tenantId),
          );
        }
      }
    } catch {
      // Tenant path doesn't exist yet
    }
  }

  // Reverse fallback: when no tenantId (single-tenant mode) but flat path is empty,
  // check if tenant directories exist and fall back to the first one found.
  // This handles the case where MULTI_TENANT was toggled off but files weren't migrated back.
  if ((options.tenantId === undefined || options.tenantId === null) && !options.userCollections) {
    try {
      const flatEntries = await fs
        .readdir(userCollections, { withFileTypes: true })
        .catch(() => []);
      const hasFlatTsFiles = flatEntries.some((e) => e.isFile() && e.name.endsWith(".ts"));
      if (!hasFlatTsFiles) {
        // Scan config/ for tenant directories
        const configDir = path.resolve(process.cwd(), "config");
        const configEntries = await fs.readdir(configDir, { withFileTypes: true }).catch(() => []);
        for (const entry of configEntries) {
          if (!entry.isDirectory() || entry.name === "collections") continue;
          const tenantColDir = path.join(configDir, entry.name, "collections");
          try {
            const tenantEntries = await fs.readdir(tenantColDir, { withFileTypes: true });
            if (tenantEntries.some((e) => e.isFile() && e.name.endsWith(".ts"))) {
              logger.warn(
                `[Compile] ⚠️  Single-tenant mode: collections found in config/${entry.name}/collections/`,
              );
              logger.warn(
                `[Compile] ⚠️  Run migration to move collections back to config/collections/`,
              );
              userCollections = path.resolve(tenantColDir);
              compiledCollections = path.resolve(
                options.compiledCollections || getCompiledCollectionsPath(entry.name),
              );
              break;
            }
          } catch {
            // No collections in this tenant dir
          }
        }
      }
    } catch {
      // Skip fallback
    }
  }

  // Adaptive concurrency: 75% of cores, floor 4
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

    // 2. Load manifest for change detection
    const {
      entries: manifest,
      collectionOrder,
      structureNodes,
    } = await loadManifest(compiledCollections);

    // 3. Discover source files (recursive walk)
    let sourceFiles = await getTypescriptAndJavascriptFiles(userCollections);

    // Filter out benchmark fixtures unless in benchmark runtime
    if (!isBenchmarkRuntime()) {
      sourceFiles = sourceFiles.filter(
        (rp) => !isBenchmarkRelativePath(rp) && !isBenchmarkArtifact(path.basename(rp)),
      );
    }

    if (sourceFiles.length === 0) {
      // Early exit: nothing to compile, but still clean orphaned output
      await removeOrphanedFiles(manifest, new Set(), result);
      await removeEmptyDirs(compiledCollections);
      await saveManifest(compiledCollections, manifest, collectionOrder, structureNodes);
      result.duration = Date.now() - startTime;
      logger.info("Compilation completed: 0 files found");
      return result;
    }

    // Create output directory structure mirroring source
    await createOutputDirectories(sourceFiles, compiledCollections);

    // Pre-compute a source-path lookup map for O(1) targetFile matching
    // Map<normalized absolute path, relative path>
    const sourceFileMap = new Map<string, string>();
    for (const rp of sourceFiles) {
      sourceFileMap.set(path.normalize(path.join(userCollections, rp)), rp);
    }

    const processedJsPaths = new Set<string>();

    // Build hash → manifest entry map for stable ID detection across renames
    // When a file is renamed (same hash, different path), we reuse the original _id
    const hashToManifestEntry = new Map<string, { targetPath: string; entry: ManifestEntry }>();
    for (const [jsPath, entry] of manifest) {
      hashToManifestEntry.set(entry.sourceHash, { targetPath: jsPath, entry });
    }

    // ─── Worker pool: index-based cursor (O(1) dequeue) ──────────
    let cursor = 0;

    const worker = async () => {
      while (cursor < sourceFiles.length) {
        const idx = cursor++;
        const relativePath = sourceFiles[idx];
        if (!relativePath) break;

        // Optional per-file filter
        if (options.targetFile) {
          const normTarget = path.normalize(options.targetFile);
          const normFile = path.normalize(path.join(userCollections, relativePath));
          if (!normFile.endsWith(normTarget) && !normTarget.endsWith(relativePath)) continue;
        }

        const sourcePath = path.join(userCollections, relativePath);
        const relativeDir = path.dirname(relativePath);
        const fileNameWithoutExt = path.basename(relativePath, path.extname(relativePath));
        const targetPath = path.resolve(
          compiledCollections,
          relativeDir,
          `${fileNameWithoutExt}.js`,
        );

        try {
          const content = await fs.readFile(sourcePath, "utf8");
          const sourceHash = await xxhash64(content);

          // Quick skip: hash + tenant match + output exists
          const existing = manifest.get(targetPath);
          let outputExists = false;
          try {
            await fs.access(targetPath);
            outputExists = true;
          } catch {
            /* file not found */
          }

          if (
            outputExists &&
            existing?.sourceHash === sourceHash &&
            existing?.tenantId === options.tenantId
          ) {
            result.skipped++;
            processedJsPaths.add(targetPath);
            continue;
          }

          // 4. Resolve stable ID from hash to handle renames gracefully
          // When a file is renamed (same hash, different path), reuse the original _id
          // so collection identity is preserved and DB records stay linked.
          let stableId: string | undefined;
          const hashMatch = hashToManifestEntry.get(sourceHash);
          if (hashMatch && hashMatch.targetPath !== targetPath) {
            // File was renamed — extract original _id from old compiled filename
            const oldBaseName = path.basename(hashMatch.targetPath, ".js");
            stableId = oldBaseName.toLowerCase().replace(/[^a-z0-9]/g, "");
            logger.info(
              `[Compile] Detected rename: ${path.basename(relativePath)} (was ${oldBaseName}) — preserving _id`,
            );
          }

          // 5. Transform & compile with single-pass composite transformer
          const compilerOptions: ts.CompilerOptions = {
            target: ts.ScriptTarget.ESNext,
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.NodeJs,
            allowJs: true,
            checkJs: false,
            skipLibCheck: true,
            esModuleInterop: true,
          };

          const compositeTransformer = createCompositeTransformer(options.tenantId, stableId);
          const compilation = ts.transpileModule(content, {
            compilerOptions,
            transformers: { before: [compositeTransformer] },
            fileName: sourcePath,
          });

          await fs.writeFile(targetPath, compilation.outputText);

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

    const poolSize = Math.min(concurrencyLimit, sourceFiles.length);
    const workers = Array.from({ length: poolSize }, () => worker());
    await Promise.all(workers);

    // 5. Orphaned file cleanup (full builds only)
    await removeOrphanedFiles(manifest, processedJsPaths, result);

    // 6. Empty directory cleanup
    await removeEmptyDirs(compiledCollections);

    // 7. Persist manifest
    await saveManifest(compiledCollections, manifest, collectionOrder, structureNodes);

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

// ─── Manifest load ─────────────────────────────────────────────────────
async function loadManifest(dir: string): Promise<LoadedManifest> {
  const manifestPath = path.join(dir, ".compilation-manifest.json");
  const resolvedDir = path.resolve(dir);
  try {
    const raw = JSON.parse(await fs.readFile(manifestPath, "utf8")) as Record<string, unknown>;
    const collectionOrder =
      raw[MANIFEST_ORDER_KEY] &&
      typeof raw[MANIFEST_ORDER_KEY] === "object" &&
      !Array.isArray(raw[MANIFEST_ORDER_KEY])
        ? (raw[MANIFEST_ORDER_KEY] as Record<string, number>)
        : undefined;
    const structureNodes = Array.isArray(raw[MANIFEST_STRUCTURE_KEY])
      ? raw[MANIFEST_STRUCTURE_KEY]
      : undefined;

    const entries = new Map<string, ManifestEntry>();
    for (const [key, value] of Object.entries(raw)) {
      if (key === MANIFEST_ORDER_KEY || key === MANIFEST_STRUCTURE_KEY) continue;
      if (!isManifestEntry(value)) continue;
      entries.set(normalizeCompiledJsPath(resolvedDir, key), value);
    }
    return { entries, collectionOrder, structureNodes };
  } catch {
    return { entries: new Map() };
  }
}

// ─── Manifest save ─────────────────────────────────────────────────────
async function saveManifest(
  dir: string,
  manifest: Map<string, ManifestEntry>,
  collectionOrder?: Record<string, number>,
  structureNodes?: unknown[],
) {
  const manifestPath = path.join(dir, ".compilation-manifest.json");
  const payload: Record<string, unknown> = Object.fromEntries(manifest);

  // Preserve collectionOrder from previous run if not provided
  if (collectionOrder && Object.keys(collectionOrder).length > 0) {
    payload[MANIFEST_ORDER_KEY] = collectionOrder;
  } else if (structureNodes === undefined) {
    try {
      const existing = JSON.parse(await fs.readFile(manifestPath, "utf8"));
      if (existing[MANIFEST_ORDER_KEY]) payload[MANIFEST_ORDER_KEY] = existing[MANIFEST_ORDER_KEY];
    } catch {
      /* no prior manifest */
    }
  }

  // Preserve structureNodes from previous run if not provided
  if (structureNodes?.length) {
    payload[MANIFEST_STRUCTURE_KEY] = structureNodes;
  } else if (structureNodes === undefined) {
    try {
      const existing = JSON.parse(await fs.readFile(manifestPath, "utf8"));
      if (existing[MANIFEST_STRUCTURE_KEY]) {
        payload[MANIFEST_STRUCTURE_KEY] = existing[MANIFEST_STRUCTURE_KEY];
      }
    } catch {
      /* no prior manifest */
    }
  }

  assertLiveDataWriteAllowed(manifestPath);
  await fs.writeFile(manifestPath, JSON.stringify(payload, null, 2));
}

// ─── File discovery (recursive) ────────────────────────────────────────
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

// ─── Output directory creation (mirrors source tree) ──────────────────
async function createOutputDirectories(files: string[], baseDir: string) {
  const dirs = new Set(files.map((f) => path.dirname(path.join(baseDir, f))));
  await Promise.all(Array.from(dirs, (d) => fs.mkdir(d, { recursive: true })));
}

// ─── Orphaned file cleanup ─────────────────────────────────────────────
async function removeOrphanedFiles(
  manifest: Map<string, ManifestEntry>,
  processed: Set<string>,
  result: CompilationResult,
) {
  for (const [jsPath] of manifest) {
    if (!processed.has(jsPath)) {
      try {
        await fs.unlink(jsPath);
      } catch {
        /* race condition or already deleted */
      }
      result.orphanedFiles.push(jsPath);
      manifest.delete(jsPath);
    }
  }
}

// ─── Empty directory cleanup (post-orphan sweep) ──────────────────────
async function removeEmptyDirs(baseDir: string): Promise<void> {
  try {
    const entries = await fs.readdir(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const fullPath = path.join(baseDir, entry.name);
      await removeEmptyDirs(fullPath);
      try {
        if ((await fs.readdir(fullPath)).length === 0) {
          await fs.rmdir(fullPath);
        }
      } catch {
        /* skip unreadable */
      }
    }
  } catch {
    /* skip unreadable */
  }
}
