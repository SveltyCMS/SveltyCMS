/**
 * @file src/utils/compilation/compile.ts
 * @description Compiles TypeScript files from the collections folder into JavaScript files using vite with custom AST transformations
 *
 * Enterprise Features:
 * - Robust Error Handling & Typing
 * - Concurrent Processing with Limit
 * - Structured Logging Interface
 * - Modular AST Transformers
 * - Content Hashing & UUID Management
 * - Orphaned File Cleanup
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as ts from 'typescript';
import { v4 as uuidv4 } from 'uuid';
import { getCollectionsPath, getCompiledCollectionsPath, isValidTenantId } from '../tenant-paths.js';
import {
	addJsExtensionTransformer,
	commonjsToEsModuleTransformer,
	schemaTenantIdTransformer,
	schemaUuidTransformer,
	widgetTransformer
} from './transformers';
import type { CompilationResult, CompileOptions, ExistingFileData, Logger } from './types';

// Schema comparison (collectionSchemaWarnings.ts) runs at runtime in GUI/API when schemas are loaded
// schemaWarnings in CompilationResult is populated by the collection save flow, not compilation

// Default logger implementation
const defaultLogger: Logger = {
	info: (msg) => console.log(`\x1b[34m[Compile]\x1b[0m ${msg}`),
	success: (msg) => console.log(`\x1b[34m[Compile]\x1b[0m \x1b[32m${msg}\x1b[0m`),
	warn: (msg) => console.warn(`\x1b[34m[Compile]\x1b[0m \x1b[33m${msg}\x1b[0m`),
	error: (msg, err) => console.error(`\x1b[34m[Compile]\x1b[0m \x1b[31m${msg}\x1b[0m`, err)
};

function logSuccess(logger: Logger, msg: string) {
	if (logger.success) {
		logger.success(msg);
	} else {
		logger.info(msg);
	}
}

export async function compile(options: CompileOptions = {}): Promise<CompilationResult> {
	const startTime = Date.now();
	const logger = options.logger || defaultLogger;

	// Validate tenant ID if provided
	if (options.tenantId !== undefined && !isValidTenantId(options.tenantId)) {
		throw new Error(`Invalid tenant ID: ${options.tenantId}`);
	}

	// Use tenant-aware paths (supports both legacy and multi-tenant modes)
	const userCollections = options.userCollections || getCollectionsPath(options.tenantId);
	const compiledCollections = options.compiledCollections || getCompiledCollectionsPath(options.tenantId);
	const concurrencyLimit = options.concurrency || 5;

	const result: CompilationResult = {
		processed: 0,
		skipped: 0,
		errors: [],
		duration: 0,
		orphanedFiles: [],
		schemaWarnings: []
	};

	try {
		// Ensure output directories exist
		await fs.mkdir(userCollections, { recursive: true });
		await fs.mkdir(compiledCollections, { recursive: true });

		// 1. Scan existing state
		const { existingFilesByPath, existingFilesByHash } = await scanCompiledFiles(compiledCollections, logger);

		// 2. Discover source files
		const sourceFiles = await getTypescriptAndJavascriptFiles(userCollections);
		const sourceFileSet = new Set(sourceFiles);

		// 3. Create directory structure
		await createOutputDirectories(sourceFiles, compiledCollections);

		// 4. Process files with concurrency control
		const processedJsPaths = new Set<string>();
		const queue = [...sourceFiles]; // Clone array to manage queue
		const workers: Promise<void>[] = [];

		// Simple concurrency implementation
		const worker = async () => {
			while (queue.length > 0) {
				const file = queue.shift();
				if (!file) {
					break;
				}

				// If specific target file is requested, skip others
				if (options.targetFile) {
					// Normalize paths for comparison (handle leading ./ or different separators)
					const normalizedTarget = path.normalize(options.targetFile);
					const normalizedFile = path.normalize(path.join(userCollections, file));
					// Check if this source file corresponds to the target file
					// The passed targetFile might be absolute or relative
					if (!(normalizedFile.endsWith(normalizedTarget) || normalizedTarget.endsWith(file))) {
						continue;
					}
				}

				try {
					// Calculate the expected JS path for this source file
					const expectedJsPath = file.replace(/\.(ts|js)$/, '.js');

					const jsFilePath = await compileFile(
						file,
						userCollections,
						compiledCollections,
						existingFilesByPath,
						existingFilesByHash,
						sourceFileSet,
						logger,
						options.tenantId
					);

					if (jsFilePath) {
						if (jsFilePath === 'SKIPPED') {
							// For skipped files, add the actual expected path (not 'SKIPPED')
							processedJsPaths.add(expectedJsPath);
							result.skipped++;
						} else {
							processedJsPaths.add(jsFilePath);
							result.processed++;
						}
					}
				} catch (err) {
					result.errors.push({
						file,
						error: err instanceof Error ? err : new Error(String(err))
					});
					logger.error(`Failed to compile ${file}`, err instanceof Error ? err : new Error(String(err)));
				}
			}
		};

		// Start workers
		for (let i = 0; i < Math.min(concurrencyLimit, sourceFiles.length); i++) {
			workers.push(worker());
		}
		await Promise.all(workers);

		// 5. Cleanup (only if doing a full compile, i.e., no targetFile)
		if (!options.targetFile) {
			result.orphanedFiles = await cleanupOrphanedFiles(existingFilesByPath, processedJsPaths, compiledCollections, logger);
		}
	} catch (error) {
		logger.error('Fatal compilation error', error);
		if (error instanceof Error && error.message.includes('Collection name conflict')) {
			throw error;
		}
		// Propagate but ensure error is logged
		throw error;
	}

	result.duration = Date.now() - startTime;
	return result;
}

// --- Helper Functions ---

async function scanCompiledFiles(
	dir: string,
	logger: Logger
): Promise<{
	existingFilesByPath: Map<string, ExistingFileData>;
	existingFilesByHash: Map<string, ExistingFileData>;
}> {
	const byPath = new Map<string, ExistingFileData>();
	const byHash = new Map<string, ExistingFileData>();

	async function traverse(current: string) {
		try {
			const entries = await fs.readdir(current, { withFileTypes: true });
			for (const entry of entries) {
				const fullPath = path.posix.join(current, entry.name);
				if (entry.isDirectory()) {
					await traverse(fullPath);
				} else if (entry.isFile() && entry.name.endsWith('.js')) {
					const relativePath = path.posix.relative(dir, fullPath);
					try {
						const content = await fs.readFile(fullPath, 'utf8');
						const hash = extractHashFromJs(content);
						const uuid = extractUUIDFromJs(content);
						const data: ExistingFileData = { jsPath: relativePath, uuid, hash };

						byPath.set(relativePath, data);
						if (hash) {
							byHash.set(hash, data);
						}
					} catch {
						logger.warn(`Could not read compiled file ${relativePath}`);
					}
				}
			}
		} catch (e) {
			if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
				logger.error(`Error scanning ${current}`, e instanceof Error ? e : new Error(String(e)));
			}
		}
	}

	await traverse(dir);
	return { existingFilesByPath: byPath, existingFilesByHash: byHash };
}

async function getTypescriptAndJavascriptFiles(folder: string, subdir = ''): Promise<string[]> {
	const files: string[] = [];
	try {
		const entries = await fs.readdir(path.posix.join(folder, subdir), {
			withFileTypes: true
		});
		const collectionNames = new Set<string>();

		for (const entry of entries) {
			const relativePath = path.posix.join(subdir, entry.name);
			if (entry.isDirectory()) {
				files.push(...(await getTypescriptAndJavascriptFiles(folder, relativePath)));
			} else if (entry.isFile() && /\.(ts|js)$/.test(entry.name)) {
				const name = entry.name.replace(/\.(ts|js)$/, '');
				if (collectionNames.has(name)) {
					throw new Error(`Collection name conflict: "${name}" used multiple times in ${path.posix.join(folder, subdir)}`);
				}
				collectionNames.add(name);
				files.push(relativePath);
			}
		}
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
			return [];
		}
		throw e;
	}
	return files;
}

async function createOutputDirectories(files: string[], baseDir: string): Promise<void> {
	const dirs = new Set(files.map((f) => path.posix.dirname(f)).filter((d) => d !== '.'));
	await Promise.all(Array.from(dirs).map((d) => fs.mkdir(path.posix.join(baseDir, d), { recursive: true })));
}

async function compileFile(
	file: string,
	srcDir: string,
	destDir: string,
	existingByPath: Map<string, ExistingFileData>,
	existingByHash: Map<string, ExistingFileData>,
	sourceSet: Set<string>,
	logger: Logger,
	tenantId?: string | null
): Promise<string | null> {
	const srcPath = path.posix.join(srcDir, file);
	const targetRel = file.replace(/\.(ts|js)$/, '.js');
	const targetAbs = path.posix.join(destDir, targetRel);

	const content = await fs.readFile(srcPath, 'utf8');
	const hash = createHash('sha256').update(content).digest('hex').slice(0, 16);
	const existing = existingByPath.get(targetRel);

	// Optimization: Skip if hash matches
	if (existing && existing.hash === hash) {
		return 'SKIPPED';
	}

	// UUID Resolution Strategy
	let uuid: string | null = null;
	let reason = '';

	// 1. Check content hash (move/rename detection)
	const moved = existingByHash.get(hash);
	if (!existing && moved?.uuid) {
		// Check if original still exists to distinguish move vs clone
		const origTs = moved.jsPath.replace(/\.js$/, '.ts');
		if (!sourceSet.has(origTs)) {
			uuid = moved.uuid;
			reason = 'Reused (move/rename)';
		}
	}

	// 2. Reuse existing file's UUID
	if (!uuid && existing?.uuid) {
		uuid = existing.uuid;
		reason = 'Reused (path match)';
	}

	// 3. Generate new
	if (!uuid) {
		uuid = uuidv4().replace(/-/g, '');
		reason = 'Generated new';
	}

	// Compile
	const transpile = file.endsWith('.ts')
		? ts.transpileModule(content, {
				compilerOptions: {
					target: ts.ScriptTarget.ESNext,
					module: ts.ModuleKind.ESNext
				}
			})
		: { outputText: content };

	let code = transformAST(transpile.outputText, uuid, tenantId);
	code = wrapOutput(code, hash, targetRel, tenantId);

	await fs.writeFile(targetAbs, code);
	logSuccess(logger, `Compiled ${file} (${reason}: \x1b[33m${uuid}\x1b[0m)`);

	return targetRel;
}

const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
function transformAST(code: string, uuid: string, tenantId?: string | null): string {
	const source = ts.createSourceFile('temp.js', code, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);
	const res = ts.transform(source, [
		schemaUuidTransformer(uuid),
		schemaTenantIdTransformer(tenantId),
		widgetTransformer,
		addJsExtensionTransformer,
		commonjsToEsModuleTransformer
	]);
	return printer.printFile(res.transformed[0]);
}

function wrapOutput(code: string, hash: string, pathRel: string, tenantId?: string | null): string {
	// Add header comments
	let out = code.replace(/(\s*\*\s*@file\s+)(.*)/, `$1.compiledCollections/${pathRel}`);
	out = out.replace(/^\/\/\s*(HASH|UUID|TENANT_ID):.*$/gm, '').trimStart();

	let header = `// WARNING: Generated file. Do not edit.\n// HASH: ${hash}\n`;

	// Add tenant ID comment if in multi-tenant mode
	if (tenantId !== undefined) {
		header += `// TENANT_ID: ${tenantId === null ? 'global' : tenantId}\n`;
	}

	return `${header}\n${out}`;
}

function extractHashFromJs(content: string) {
	return content.match(/^\/\/\s*HASH:\s*([a-f0-9]{16})\s*$/m)?.[1] || null;
}
function extractUUIDFromJs(content: string) {
	return content.match(/^\/\/\s*UUID:\s*([a-f0-9-]+)\s*$/m)?.[1] || null;
}

async function cleanupOrphanedFiles(
	existing: Map<string, ExistingFileData>,
	kept: Set<string>,
	compiledCollections: string,
	logger: Logger
): Promise<string[]> {
	const orphanedFiles = Array.from(existing.keys()).filter((f) => !kept.has(f) && f !== 'SKIPPED');

	if (orphanedFiles.length > 0) {
		// Terminal-friendly formatted message with actionable guidance
		const divider = '─'.repeat(60);
		logger.warn(`\n┌${divider}┐`);
		logger.warn(`│  ⚠️  Orphaned Compiled Collections Detected${' '.repeat(15)}│`);
		logger.warn(`├${divider}┤`);
		logger.warn(`│${' '.repeat(61)}│`);
		logger.warn(`│  The following compiled files have no matching source:${' '.repeat(4)}│`);

		for (const file of orphanedFiles) {
			const padding = 57 - file.length;
			logger.warn(`│    • ${file}${' '.repeat(Math.max(0, padding))}│`);
		}

		logger.warn(`│${' '.repeat(61)}│`);
		logger.warn(`│  This usually means:${' '.repeat(39)}│`);
		logger.warn(`│    1. You renamed/moved a source collection file${' '.repeat(10)}│`);
		logger.warn(`│    2. You deleted a collection that's no longer needed${' '.repeat(4)}│`);
		logger.warn(`│${' '.repeat(61)}│`);
		logger.warn(`│  Removing orphaned compiled files from disk.${' '.repeat(18)}│`);
		logger.warn(`│    ${compiledCollections.slice(-50)}${' '.repeat(Math.max(0, 55 - compiledCollections.slice(-50).length))}│`);
		logger.warn(`│${' '.repeat(61)}│`);
		logger.warn(`└${divider}┘\n`);

		// Delete orphaned .js files so they don't linger (e.g. after rename new -> new1)
		for (const relativePath of orphanedFiles) {
			const fullPath = path.join(compiledCollections, relativePath);
			try {
				await fs.unlink(fullPath);
				logger.info(`Removed orphan: ${relativePath}`);
			} catch (unlinkErr) {
				logger.warn(`Could not remove orphaned file ${relativePath}: ${unlinkErr instanceof Error ? unlinkErr.message : String(unlinkErr)}`);
			}
		}
	}

	// Return the list so GUI can display it appropriately
	return orphanedFiles;
}
