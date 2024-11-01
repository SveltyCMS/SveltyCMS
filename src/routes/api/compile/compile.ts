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
 */

import fs from 'fs/promises';
import crypto from 'crypto';
import path from 'path';
import * as ts from 'typescript';

// Cache for transpiled modules to avoid recompiling unchanged files
const cache = new Map<string, string>();

interface CompileOptions {
	collectionsFolderJS?: string;
	collectionsFolderTS?: string;
}

export async function compile(options: CompileOptions = {}): Promise<void> {
	// Destructure options with default values from environment variables
	const { collectionsFolderJS = process.env.COLLECTIONS_FOLDER_JS, collectionsFolderTS = process.env.COLLECTIONS_FOLDER_TS } = options;

	// Validate that folder paths are provided
	if (!collectionsFolderJS || !collectionsFolderTS) {
		throw new Error('Collections folders not specified');
	}

	// Ensure the output directory exists
	await fs.mkdir(collectionsFolderJS, { recursive: true });
	await fs.mkdir(collectionsFolderTS, { recursive: true });

	// Get list of TypeScript files to compile
	const files = await getTypescriptFiles(collectionsFolderTS);

	// Create necessary subdirectories in the JS folder
	await createOutputDirectories(files, collectionsFolderTS, collectionsFolderJS);

	// Compile all files concurrently
	await Promise.all(files.map((file) => compileFile(file, collectionsFolderTS, collectionsFolderJS)));
}

async function getTypescriptFiles(folder: string, subdir: string = ''): Promise<string[]> {
	const files: string[] = [];
	const entries = await fs.readdir(path.join(folder, subdir), { withFileTypes: true });

	for (const entry of entries) {
		const relativePath = path.join(subdir, entry.name);

		if (entry.isDirectory()) {
			// Recursively get files from subdirectories
			const subFiles = await getTypescriptFiles(folder, relativePath);
			files.push(...subFiles);
		} else if (
			entry.isFile() &&
			entry.name.endsWith('.ts') &&
			!['index.ts', 'types.ts', 'categories.ts', 'CollectionManager.ts'].includes(entry.name)
		) {
			files.push(relativePath);
		}
	}

	return files;
}

async function createOutputDirectories(files: string[], srcFolder: string, destFolder: string): Promise<void> {
	// Get all unique directory paths from the files
	const directories = new Set(files.map((file) => path.dirname(file)).filter((dir) => dir !== '.'));

	// Create each directory in the output folder
	for (const dir of directories) {
		const outputDir = path.join(destFolder, dir);
		await fs.mkdir(outputDir, { recursive: true });
	}
}

async function compileFile(file: string, srcFolder: string, destFolder: string): Promise<void> {
	const tsFilePath = path.join(srcFolder, file);
	const jsFilePath = path.join(destFolder, file.replace(/\.ts$/, '.js'));
	const shortPath = `/collections/${file.replace(/\.ts$/, '.js')}`;

	try {
		// Check if recompilation is necessary
		if (!(await shouldRecompile(tsFilePath, jsFilePath))) {
			console.log(`Skipping compilation for \x1b[34m${file}\x1b[0m, no changes detected.`);
			return;
		}

		// Read, transpile, and write the file
		const content = await fs.readFile(tsFilePath, 'utf-8');
		const code = await transpileCode(content, tsFilePath);
		await writeCompiledFile(jsFilePath, code, content);

		console.log(`Compiled and wrote \x1b[34m${shortPath}\x1b[0m`);
	} catch (error) {
		console.error(`Error compiling ${file}: ${error instanceof Error ? error.message : String(error)}`);
	}
}

async function shouldRecompile(tsFilePath: string, jsFilePath: string): Promise<boolean> {
	// Get file stats for both TS and JS files
	const [tsStats, jsStats] = await Promise.all([fs.stat(tsFilePath).catch(() => null), fs.stat(jsFilePath).catch(() => null)]);

	// If JS file doesn't exist, recompilation is necessary
	if (!jsStats) return true;

	// If TS file doesn't exist, recompilation is not necessary
	if (!tsStats) return false;

	// Compare file hashes and modification times
	const contentHash = await getFileHash(tsFilePath);
	const existingHash = await getExistingHash(jsFilePath);

	return contentHash !== existingHash || tsStats.mtime > jsStats.mtime;
}

async function transpileCode(content: string, filePath: string): Promise<string> {
	// Check cache for previously transpiled code
	let code = cache.get(filePath);

	if (!code) {
		// Transpile TypeScript to JavaScript
		const transpileResult = ts.transpileModule(content, {
			compilerOptions: {
				target: ts.ScriptTarget.ESNext,
				module: ts.ModuleKind.ESNext
			}
		});

		code = modifyTranspiledCode(transpileResult.outputText);
		cache.set(filePath, code);
	}

	return code;
}

function modifyTranspiledCode(code: string): string {
	// Modify transpiled code to fit project requirements
	return code
		.replace(/import widgets from .*\n/g, '') // Remove widget imports
		.replace(/widgets/g, 'globalThis.widgets') // Replace widget references with globalThis.widgets
		.replace(/(\bfrom\s+["']\..*)(["'])/g, '$1.js$2'); // Add .js extension to relative import paths
}

async function writeCompiledFile(filePath: string, code: string, originalContent: string): Promise<void> {
	// Create the directory if it doesn't exist
	await fs.mkdir(path.dirname(filePath), { recursive: true });

	// Add content hash to the file for future comparisons
	const contentHash = await getContentHash(originalContent);
	const updatedCode = `// ${contentHash}\n${code}`;
	await fs.writeFile(filePath, updatedCode);
}

async function getFileHash(filePath: string): Promise<string> {
	// Generate MD5 hash of file content
	const content = await fs.readFile(filePath);
	return crypto.createHash('md5').update(content).digest('hex');
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
