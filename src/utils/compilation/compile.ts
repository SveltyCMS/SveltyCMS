/**
 * @file src/utils/compilation/compile.ts
 * @description Compiles TypeScript files from the collections folder into JavaScript files using the TypeScript compiler with custom AST transformations
 */

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import * as ts from "typescript";
import os from "node:os";
import {
  getCollectionsPath,
  getCompiledCollectionsPath,
  isValidTenantId,
} from "../tenant-paths.ts";
import {
  addJsExtensionTransformer,
  commonjsToEsModuleTransformer,
  schemaTenantIdTransformer,
  schemaUuidTransformer,
  widgetTransformer,
} from "./transformers.ts";
import type { CompilationResult, CompileOptions, Logger } from "./types";

const defaultLogger: Logger = {
  info: (msg) => console.log(`\x1b[34m[Compile]\x1b[0m ${msg}`),
  success: (msg) => console.log(`\x1b[34m[Compile]\x1b[0m \x1b[32m${msg}\x1b[0m`),
  warn: (msg) => console.warn(`\x1b[34m[Compile]\x1b[0m \x1b[33m${msg}\x1b[0m`),
  error: (msg, err) => console.error(`\x1b[34m[Compile]\x1b[0m \x1b[31m${msg}\x1b[0m`, err),
};

export async function compile(options: CompileOptions = {}): Promise<CompilationResult> {
  const startTime = Date.now();
  const logger = options.logger || defaultLogger;

  if (options.tenantId !== undefined && !isValidTenantId(options.tenantId)) {
    throw new Error(`Invalid tenant ID: ${options.tenantId}`);
  }

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
    await fs.mkdir(userCollections, { recursive: true });
    await fs.mkdir(compiledCollections, { recursive: true });

    const { existingFilesByPath } = await scanCompiledFiles(compiledCollections);

    const sourceFiles = await getTypescriptAndJavascriptFiles(userCollections);

    await createOutputDirectories(sourceFiles, compiledCollections);

    const processedJsPaths = new Set<string>();
    const queue = [...sourceFiles];
    const workers: Promise<void>[] = [];

    const worker = async () => {
      while (queue.length > 0) {
        const file = queue.shift();
        if (!file) break;

        if (options.targetFile) {
          const normalizedTarget = path.normalize(options.targetFile);
          const normalizedFile = path.normalize(path.join(userCollections, file));
          if (!(normalizedFile.endsWith(normalizedTarget) || normalizedTarget.endsWith(file))) {
            continue;
          }
        }

        const sourcePath = path.join(userCollections, file);
        const relativeDir = path.dirname(file);
        const fileNameWithoutExt = path.basename(file, path.extname(file));
        const targetPath = path.join(compiledCollections, relativeDir, `${fileNameWithoutExt}.js`);

        try {
          const content = await fs.readFile(sourcePath, "utf8");
          const hash = createHash("md5").update(content).digest("hex");

          const existingByPath = existingFilesByPath.get(targetPath);
          if (existingByPath && existingByPath.hash === hash) {
            result.skipped++;
            processedJsPaths.add(targetPath);
            continue;
          }

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
              widgetTransformer,
              schemaUuidTransformer(createHash("md5").update(file).digest("hex")),
              schemaTenantIdTransformer(options.tenantId),
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
          result.processed++;
          processedJsPaths.add(targetPath);
        } catch (err: any) {
          result.errors.push({ file, error: err });
          logger.error(`Error compiling ${file}:`, err);
        }
      }
    };

    for (let i = 0; i < Math.min(concurrencyLimit, sourceFiles.length); i++) {
      workers.push(worker());
    }

    await Promise.all(workers);

    // Cleanup orphaned files
    if (!options.targetFile) {
      for (const [filePath, data] of existingFilesByPath.entries()) {
        if (!processedJsPaths.has(filePath)) {
          await fs.unlink(filePath);
          result.orphanedFiles.push(data.path);
        }
      }
    }

    result.duration = Date.now() - startTime;
    return result;
  } catch (error: any) {
    logger.error("Compilation failed:", error);
    throw error;
  }
}

async function scanCompiledFiles(dir: string) {
  const existingFilesByPath = new Map<string, { path: string; hash: string }>();

  async function walk(currentDir: string) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".js")) {
        const content = await fs.readFile(fullPath, "utf8");
        const hash = createHash("md5").update(content).digest("hex");

        existingFilesByPath.set(fullPath, { path: fullPath, hash });
      }
    }
  }

  try {
    await walk(dir);
  } catch {
    // Dir might not exist yet
  }

  return { existingFilesByPath };
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
