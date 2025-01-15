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
 * - HASH and UUID Management for collections and widgets
 */

import fs from 'fs/promises';
import crypto from 'crypto';
import path from 'path';
import * as ts from 'typescript';
import { v4 as uuidv4 } from 'uuid'; // Random UUID generation

// Cache for transpiled modules - Key: file path, Value: { hash: string; code: string; uuid: string }
const cache = new Map<string, { hash: string; code: string; uuid: string }>();

interface CompileOptions {
	systemCollections?: string;
	userCollections?: string;
	compiledCollections?: string;
}

export async function compile(options: CompileOptions = {}): Promise<void> {
	// Define collection paths directly and use process.cwd()
	const {
		userCollections = path.posix.join(process.cwd(), 'config/collections'),
		compiledCollections = path.posix.join(process.cwd(), 'compiledCollections')
	} = options;

	try {
		// Ensure the output directory exists
		await fs.mkdir(compiledCollections, { recursive: true });

		// Get TypeScript and JavaScript files from user collections
		const userFiles = await getTypescriptAndJavascriptFiles(userCollections);

		// Create output directories for user collection files
		await createOutputDirectories(userFiles, userCollections, compiledCollections);

		// Compile user collection files concurrently
		const compilePromises = userFiles.map((file) => compileFile(file, userCollections, compiledCollections));
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

async function getTypescriptAndJavascriptFiles(folder: string, subdir: string = ''): Promise<string[]> {
	const files: string[] = [];
	const collectionNames = new Set<string>();
	const entries = await fs.readdir(path.posix.join(folder, subdir), { withFileTypes: true });

	for (const entry of entries) {
		const relativePath = path.posix.join(subdir, entry.name);

		if (entry.isDirectory()) {
			// Recursively get files from subdirectories
			const subFiles = await getTypescriptAndJavascriptFiles(folder, relativePath);
			files.push(...subFiles);
		} else if (entry.isFile()) {
			// Check if the entry is a file before further processing
			if (entry.name.endsWith('.ts') || entry.name.endsWith('.js')) {
				// Check for name conflicts
				const collectionName = entry.name.replace(/\.(ts|js)$/, '');
				if (collectionNames.has(collectionName)) {
					throw new Error(`Collection name conflict: "${collectionName}" is used multiple times.`);
				}
				collectionNames.add(collectionName);
				files.push(relativePath);
			}
		}
	}

	return files;
}

export async function cleanupOrphanedFiles(srcFolder: string, destFolder: string): Promise<void> {
	try {
		// Get list of valid TypeScript and JavaScript source files
		const validFiles = await getTypescriptAndJavascriptFiles(srcFolder);
		const validJsFiles = new Set(validFiles.map((file) => file.replace(/\.(ts|js)$/, '.js')));

		// Get all JS files in the destination folder using recursive directory iteration
		async function getAllJsFiles(folder: string): Promise<string[]> {
			const files: string[] = [];

			async function traverseDirectory(currentFolder: string) {
				const entries = await fs.readdir(currentFolder, { withFileTypes: true });

				for (const entry of entries) {
					const fullPath = path.posix.join(currentFolder, entry.name);

					if (entry.isDirectory()) {
						// Only call traverseDirectory recursively if it's a directory
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
				console.log(`\x1b[31mRemoving orphaned collection file:\x1b[0m \x1b[34m${jsFile}\x1b[0m`);
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
		console.error(`Error cleaning up orphaned files: ${error instanceof Error ? error.message : String(error)}`);
	}
}

// Optimized for creating nested output directories
async function createOutputDirectories(files: string[], srcFolder: string, destFolder: string): Promise<void> {
	// Get all unique directory paths from the files
	const directories = new Set(files.map((file) => path.posix.dirname(file)).filter((dir) => dir !== '.'));

	// Create each directory in the output folder concurrently
	const mkdirPromises = Array.from(directories).map((dir) => {
		const outputDir = path.posix.join(destFolder, dir);
		return fs.mkdir(outputDir, { recursive: true });
	});

	await Promise.all(mkdirPromises);
}

async function compileFile(file: string, srcFolder: string, destFolder: string): Promise<void> {
	const isTypeScript = file.endsWith('.ts');
	const tsFilePath = path.posix.join(srcFolder, file);
	const jsFilePath = path.posix.join(destFolder, file.replace(/\.(ts|js)$/, '.js'));
	const shortPath = path.posix.relative(process.cwd(), jsFilePath);

	try {
		// 1. Read the file content
		const content = await fs.readFile(tsFilePath, 'utf8');
		const contentHash = await getContentHash(content);

		// 2. Generate or retrieve UUID for the compiled file
		let uuid = await getExistingUUID(jsFilePath);
		if (!uuid) {
			uuid = uuidv4();
		}

		// 3. Check if recompilation is needed (using hash and UUID)
		if (!(await shouldRecompile(jsFilePath, contentHash, uuid))) {
			console.log(`Skipping compilation for \x1b[34m${shortPath}\x1b[0m, no changes detected.`);
			return;
		}

		let finalCode: string;

		if (isTypeScript) {
			// 4. Transpile TypeScript code
			const result = ts.transpileModule(content, {
				compilerOptions: {
					target: ts.ScriptTarget.ESNext,
					module: ts.ModuleKind.ESNext,
					esModuleInterop: true,
					allowJs: true
				}
			});
			finalCode = result.outputText;
		} else {
			// Handle JavaScript files
			const isESModule = content.includes('export') || content.includes('import');
			if (!isESModule) {
				// Convert CommonJS to ES Module
				if (content.includes('module.exports')) {
					// Handle module.exports = {...}
					finalCode = content.replace(/module\.exports\s*=\s*/, 'export default ');
				} else {
					// Wrap the entire content in a default export
					finalCode = `export default ${content};\n`;
				}
			} else {
				finalCode = content;
			}
		}

		// 5. Modify the transpiled code
		finalCode = modifyTranspiledCode(finalCode);

		// 6. Add UUIDs to widget fields
		finalCode = addUUIDsToWidgetFields(finalCode);

		// 7. Process Hash and UUID
		finalCode = processHashAndUUID(finalCode, contentHash, uuid);

		// 8. Write the compiled file
		await writeCompiledFile(jsFilePath, finalCode);

		// 9. Update cache
		cache.set(tsFilePath, { hash: contentHash, code: finalCode, uuid });

		console.log(`Compiled and wrote \x1b[32m${shortPath}\x1b[0m`);
	} catch (error) {
		console.error(`Error compiling file ${file}:`, error);
		throw error;
	}
}

function modifyTranspiledCode(code: string): string {
	// Modify transpiled code to fit project requirements
	return code
		.replace(/import widgets from .*\n/g, '') // Remove widget imports
		.replace(/widgets/g, 'globalThis.widgets') // Replace widget references with globalThis.widgets
		.replace(/(\bfrom\s+["']\..*)(["'])/g, '$1.js$2'); // Add .js extension to relative import paths
}

function addUUIDsToWidgetFields(code: string): string {
	// Use a regex to find all widget fields and add UUIDs to them
	const widgetFieldRegex = /(widgets\.\w+\({[\s\S]*?})/g;
	const modifiedCode = code.replace(widgetFieldRegex, (match) => {
		// Add a UUID property to the widget field
		return match.replace(/{/, `{ uuid: '${uuidv4()}', `);
	});

	return modifiedCode;
}

async function shouldRecompile(jsFilePath: string, currentHash: string, currentUUID: string): Promise<boolean> {
	try {
		// Check if JS file exists
		await fs.access(jsFilePath);

		// Get existing hash and UUID from JS file
		const jsContent = await fs.readFile(jsFilePath, 'utf8');
		const existingHash = extractHashFromJs(jsContent);
		const existingUUID = extractUUIDFromJs(jsContent);

		// Recompile if hash or UUID doesn't match
		return existingHash !== currentHash || existingUUID !== currentUUID;
	} catch (error) {
		// If the file doesn't exist, we should recompile
		if (error.code === 'ENOENT') {
			return true;
		}
		console.error('Error checking recompilation need:', error);
		return true;
	}
}

function processHashAndUUID(code: string, hash: string, uuid: string): string {
	// Remove any existing Hash and UUID comments
	let newCode = code.replace(/^\/\/\s*(HASH|UUID):\s*.*$/gm, '');

	// Add new Hash and UUID comments at the beginning
	const hashComment = `// HASH: ${hash}`;
	const uuidComment = `// UUID: ${uuid}`;
	newCode = `${hashComment}\n${uuidComment}\n\n${newCode}\n`;

	return newCode;
}

async function writeCompiledFile(filePath: string, code: string): Promise<void> {
	await fs.mkdir(path.posix.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, code);
}

async function getContentHash(content: string): Promise<string> {
	return crypto.createHash('md5').update(content).digest('hex');
}

// Helper function to extract Hash from JS file content
function extractHashFromJs(content: string): string | null {
	const match = content.match(/\/\/\s*HASH:\s*([a-f0-9]+)/);
	return match ? match[1] : null;
}

// Helper function to extract UUID from JS file content or generate a new one
async function getExistingUUID(jsFilePath: string): Promise<string | null> {
	try {
		const jsContent = await fs.readFile(jsFilePath, 'utf8');
		return extractUUIDFromJs(jsContent);
	} catch (error) {
		if (error.code === 'ENOENT') {
			// File doesn't exist, return null to generate a new UUID
			return null;
		} else {
			// Other error, rethrow
			console.error('Error reading JS file:', error);
			throw error;
		}
	}
}

// Helper function to extract UUID from JS file content
function extractUUIDFromJs(content: string): string | null {
	const match = content.match(/\/\/\s*UUID:\s*([a-f0-9-]+)/);
	return match ? match[1] : null;
}
