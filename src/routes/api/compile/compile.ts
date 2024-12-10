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
 */

import fs from 'fs/promises';
import crypto from 'crypto';
import path from 'path';
import * as ts from 'typescript';

// Cache for transpiled modules - Key: file path, Value: { hash, code }
const cache = new Map<string, { hash: string; code: string }>();

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
	const shortPath = `/collections/${file.replace(/\.ts$/, '.js')}`;

	try {
		// Read the content of the TS file
		const content = await fs.readFile(tsFilePath, 'utf-8');
		const contentHash = await getContentHash(content);

		// Check if recompilation is necessary
		if (!(await shouldRecompile(tsFilePath, jsFilePath, contentHash))) {
			console.log(`Skipping compilation for \x1b[34m${file}\x1b[0m, no changes detected.`);
			return;
		}

		// Transpile and write the file
		const code = await transpileCode(content, tsFilePath, contentHash);
		await writeCompiledFile(jsFilePath, code, contentHash);

		console.log(`Compiled and wrote \x1b[32m${shortPath}\x1b[0m`);
	} catch (error) {
		console.error(
			`Error compiling ${file}: ${error instanceof Error ? error.message : String(error)}`
		);
	}
}

async function shouldRecompile(
	tsFilePath: string,
	jsFilePath: string,
	currentHash: string
): Promise<boolean> {
	try {
		// Check if JS file exists
		const jsExists = await fs
			.access(jsFilePath)
			.then(() => true)
			.catch(() => false);
		if (!jsExists) return true;

		// Compare modification times
		const [tsStats, jsStats] = await Promise.all([fs.stat(tsFilePath), fs.stat(jsFilePath)]);
		if (tsStats.mtime > jsStats.mtime) return true;

		// Compare content hashes
		const existingHash = await getExistingHash(jsFilePath);
		if (existingHash !== currentHash) return true;

		// No changes detected
		return false;
	} catch (error) {
		console.error(
			`Error in shouldRecompile: ${error instanceof Error ? error.message : String(error)}`
		);
		return true; // Recompile on error to be safe
	}
}

async function transpileCode(
	content: string,
	filePath: string,
	contentHash: string
): Promise<string> {
	// Check cache for previously transpiled code
	const cached = cache.get(filePath);
	if (cached && cached.hash === contentHash) {
		return cached.code;
	}

	// Transpile TypeScript to JavaScript
	const transpileResult = ts.transpileModule(content, {
		compilerOptions: {
			target: ts.ScriptTarget.ESNext,
			module: ts.ModuleKind.ESNext
		}
	});

	const code = modifyTranspiledCode(transpileResult.outputText);

	// Update cache
	cache.set(filePath, { hash: contentHash, code });

	return code;
}

function modifyTranspiledCode(code: string): string {
	// Modify transpiled code to fit project requirements
	return code
		.replace(/import widgets from .*\n/g, '') // Remove widget imports
		.replace(/widgets/g, 'globalThis.widgets') // Replace widget references with globalThis.widgets
		.replace(/(\bfrom\s+["']\..*)(["'])/g, '$1.js$2'); // Add .js extension to relative import paths
}

async function writeCompiledFile(filePath: string, code: string, contentHash: string): Promise<void> {
	// Create the directory if it doesn't exist
	await fs.mkdir(path.dirname(filePath), { recursive: true });

	// Add content hash to the file for future comparisons
	const updatedCode = `// ${contentHash}\n${code}`;
	await fs.writeFile(filePath, updatedCode);
}

async function getExistingHash(filePath: string): Promise<string | null> {
	// Extract existing hash from the first line of the file
	try {
		const content = await fs.readFile(filePath, 'utf-8');
		return content.split('\n')[0].replace('// ', '');
	} catch {
		return null;
	}
}

async function getContentHash(content: string): Promise<string> {
	// Generate MD5 hash of content string
	return crypto.createHash('md5').update(content).digest('hex');
}