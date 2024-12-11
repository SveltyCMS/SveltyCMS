/**
 * @file src/routes/api/compile/compile.ts
 * @description Compiles TypeScript files from the collections folder into JavaScript files.
 *
 * Features:
 * - Recursive directory scanning for nested collections
 * - File caching to avoid unnecessary recompilation
 * - Content hashing for change detection
 * - Concurrent file operations for improved performance
 * - Support for nested category structure
 * - Error handling and logging
 * - Cleanup of orphaned collection files
 * - Name conflict detection to prevent duplicate collection names
 * - UUID handling and modification of compilation process
 */

import fs from 'fs/promises';
import crypto from 'crypto';
import path from 'path';
import * as ts from 'typescript';
import { v4 as uuidv4 } from 'uuid';
import { MongoDBAdapter } from '@src/databases/mongodb/mongoDBAdapter';

// Cache for transpiled modules - Key: file path, Value: { hash: string; code: string; uuid: string }
const cache = new Map<string, { hash: string; code: string; uuid: string }>();

interface CompileOptions {
	systemCollections?: string;
	userCollections?: string;
	compiledCollections?: string;
}

export async function compile(options: CompileOptions = {}): Promise<void> {
	// Define collection paths directly
	const {
		userCollections = path.posix.join(__dirname, '../../../config/collections'),
		compiledCollections = path.posix.join(__dirname, '../../../collections')
	} = options;

	try {
		// Ensure the output directory exists
		await fs.mkdir(compiledCollections, { recursive: true });

		// Get TypeScript files from user collections only (system collections are not compiled)
		const userFiles = await getTypescriptFiles(userCollections);

		// Create output directories for user collection files
		await createOutputDirectories(userFiles, userCollections, compiledCollections);

		// Compile user collection files concurrently
		const compilePromises = userFiles.map((file) =>
			compileFile(file, userCollections, compiledCollections)
		);
		await Promise.all(compilePromises);

		// Cleanup orphaned files only in the compiled collections directory
		await cleanupOrphanedFiles(userCollections, compiledCollections);

		// Sync collections with MongoDB after compilation
		const db = new MongoDBAdapter();
		await db.connect();
		await db.syncCollections();
		await db.disconnect();
	} catch (error) {
		if (error instanceof Error && error.message.includes('Collection name conflict')) {
			console.error('\x1b[31mError:\x1b[0m', error.message);
			throw error;
		}
		throw error;
	}
}

async function getTypescriptFiles(folder: string, subdir: string = ''): Promise<string[]> {
	const files: string[] = [];
	const collectionNames = new Set<string>();
	const entries = await fs.readdir(path.posix.join(folder, subdir), { withFileTypes: true });

	for (const entry of entries) {
		const relativePath = path.posix.join(subdir, entry.name);

		if (entry.isDirectory()) {
			// Recursively get files from subdirectories
			const subFiles = await getTypescriptFiles(folder, relativePath);
			files.push(...subFiles);
		} else if (
			entry.isFile() &&
			entry.name.endsWith('.ts') &&
			!entry.name.startsWith('_') &&
			relativePath.includes('/')
		) {
			// Check for name conflicts
			const collectionName = entry.name.replace(/\.ts$/, '');
			if (collectionNames.has(collectionName)) {
				throw new Error(`Collection name conflict: "${collectionName}" is used multiple times.`);
			}
			collectionNames.add(collectionName);
			files.push(relativePath);
		}
	}

	return files;
}

async function cleanupOrphanedFiles(srcFolder: string, destFolder: string): Promise<void> {
	try {
		// Get list of valid TypeScript source files
		const validFiles = await getTypescriptFiles(srcFolder);
		const validJsFiles = new Set(validFiles.map((file) => file.replace(/\.ts$/, '.js')));

		// Get all JS files in the destination folder using recursive directory iteration
		async function getAllJsFiles(folder: string): Promise<string[]> {
			const files: string[] = [];

			async function traverseDirectory(currentFolder: string) {
				const entries = await fs.readdir(currentFolder, { withFileTypes: true });

				for (const entry of entries) {
					const fullPath = path.posix.join(currentFolder, entry.name);

					if (entry.isDirectory()) {
						await traverseDirectory(fullPath);
					} else if (entry.isFile() && entry.name.endsWith('.js')) {
						// Calculate relative path relative to destFolder
						const relativePath = path.posix.relative(destFolder, fullPath);
						files.push(relativePath);
					}
				}
			}

			await traverseDirectory(folder);
			return files;
		}

		const existingJsFiles = await getAllJsFiles(destFolder);

		// Remove orphaned JS files
		const unlinkPromises = existingJsFiles
			.filter((jsFile) => !validJsFiles.has(jsFile))
			.map(async (jsFile) => {
				const fullPath = path.posix.join(destFolder, jsFile);
				console.log(
					`\x1b[31mRemoving orphaned collection file:\x1b[0m \x1b[34m${jsFile}\x1b[0m`
				);
				await fs.unlink(fullPath);
			});
		await Promise.all(unlinkPromises);

		// Clean up empty directories using a recursive function with a post-order traversal
		async function removeEmptyDirs(folder: string): Promise<boolean> {
			const entries = await fs.readdir(folder, { withFileTypes: true });
			let isEmpty = true;

			for (const entry of entries) {
				if (entry.isDirectory()) {
					const fullPath = path.posix.join(folder, entry.name);
					if (!(await removeEmptyDirs(fullPath))) {
						isEmpty = false;
					}
				} else {
					isEmpty = false;
				}
			}

			if (isEmpty) {
				await fs.rmdir(folder);
			}
			return isEmpty;
		}

		await removeEmptyDirs(destFolder);
	} catch (error) {
		console.error(
			`Error cleaning up orphaned files: ${error instanceof Error ? error.message : String(error)}`
		);
	}
}

// Optimized for creating nested output directories
async function createOutputDirectories(files: string[], srcFolder: string, destFolder: string): Promise<void> {
	// Get all unique directory paths from the files
	const directories = new Set(files.map(file => path.posix.dirname(file)).filter(dir => dir !== '.'));

	// Create each directory in the output folder concurrently
	const mkdirPromises = Array.from(directories).map(dir => {
		const outputDir = path.posix.join(destFolder, dir);
		return fs.mkdir(outputDir, { recursive: true });
	});

	await Promise.all(mkdirPromises);
}

async function compileFile(file: string, srcFolder: string, destFolder: string): Promise<void> {
	const tsFilePath = path.posix.join(srcFolder, file);
	const jsFilePath = path.posix.join(destFolder, file.replace(/\.ts$/, '.js'));
	const shortPath = path.relative(process.cwd(), jsFilePath);

	try {
		// First ensure UUID exists in TS file
		const uuid = await ensureUUID(tsFilePath);
		
		// Read the TypeScript file content (after possible UUID addition)
		const content = await fs.readFile(tsFilePath, 'utf8');
		const contentHash = await getContentHash(content);

		// Check if recompilation is needed
		if (!(await shouldRecompile(tsFilePath, jsFilePath, contentHash))) {
			console.log(`Skipping compilation for \x1b[34m${shortPath}\x1b[0m, no changes detected.`);
			return;
		}

		// Transpile the code
		const result = ts.transpileModule(content, {
			compilerOptions: {
				target: ts.ScriptTarget.ESNext,
				module: ts.ModuleKind.ESNext
			}
		});

		// Add hash and UUID to JS file
		const hashComment = `// Hash: ${contentHash}`;
		const uuidComment = `// UUID: ${uuid}`;
		const finalCode = `${hashComment}\n${uuidComment}\n${result.outputText}`;

		// Write the compiled file
		await writeCompiledFile(jsFilePath, finalCode);

		// Update cache
		cache.set(tsFilePath, { hash: contentHash, code: finalCode, uuid });

		console.log(`Compiled and wrote \x1b[32m${shortPath}\x1b[0m`);
	} catch (error) {
		console.error(`Error compiling file ${file}:`, error);
		throw error;
	}
}

async function shouldRecompile(
	tsFilePath: string,
	jsFilePath: string,
	currentHash: string
): Promise<boolean> {
	try {
		// Check if JS file exists
		const jsStats = await fs.stat(jsFilePath).catch(() => null);
		if (!jsStats) {
			return true;
		}

		// Get hash and UUID from JS file
		const content = await fs.readFile(jsFilePath, 'utf8');
		const hashMatch = content.match(/\/\/\s*Hash:\s*([a-f0-9]+)/);
		const existingHash = hashMatch ? hashMatch[1] : null;

		// If hash matches, verify UUID matches TS file
		if (existingHash === currentHash) {
			const tsContent = await fs.readFile(tsFilePath, 'utf8');
			const tsUUID = await extractUUID(tsContent);
			const jsUUIDMatch = content.match(/\/\/\s*UUID:\s*([a-f0-9-]{36})/);
			
			if (!tsUUID || !jsUUIDMatch || tsUUID !== jsUUIDMatch[1]) {
				return true; // Recompile if UUIDs don't match
			}
			return false; // Skip if both hash and UUID match
		}

		return true; // Recompile if hash doesn't match
	} catch (error) {
		console.error('Error checking recompilation need:', error);
		return true;
	}
}

async function writeCompiledFile(filePath: string, code: string): Promise<void> {
	// Ensure the directory exists
	await fs.mkdir(path.dirname(filePath), { recursive: true });

	// Write the code directly since hash is already included in the code
	await fs.writeFile(filePath, code);
}

async function getContentHash(content: string): Promise<string> {
	// Generate MD5 hash of content string
	return crypto.createHash('md5').update(content).digest('hex');
}

// Function to extract UUID from file content
async function extractUUID(content: string): Promise<string | null> {
	const uuidMatch = content.match(/\/\/\s*UUID:\s*([a-f0-9-]{36})/i);
	return uuidMatch ? uuidMatch[1] : null;
}

// Function to ensure UUID in TS file
async function ensureUUID(tsFilePath: string): Promise<string> {
	const content = await fs.readFile(tsFilePath, 'utf8');
	const existingUUID = await extractUUID(content);
	
	if (existingUUID) {
		return existingUUID;
	}
	
	// Generate new UUID and add to TS file
	const uuid = uuidv4();
	const uuidComment = `// UUID: ${uuid}\n`;
	await fs.writeFile(tsFilePath, uuidComment + content, 'utf8');
	console.log(`Added UUID to TS file: \x1b[34m${path.relative(process.cwd(), tsFilePath)}\x1b[0m`);
	
	return uuid;
}