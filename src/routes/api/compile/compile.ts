/**
 * @file src/routes/api/compile/compile.ts
 * @description Compiles TypeScript files from the collections folder into JavaScript files
 *
 * Features:
 * - File caching to avoid unnecessary recompilation
 * - Content hashing for change detection
 * - Asynchronous file operations for improved performance
 * - Error handling and logging
 *
 * Usage:
 * import { compile } from './compile';
 * await compile();
 */

import fs from 'fs/promises';
import crypto from 'crypto';
import path from 'path';
import logger from '@src/utils/logger';

// Cache for transpiled modules
const cache = new Map<string, string>();

interface CompileOptions {
	collectionsFolderJS: string;
	collectionsFolderTS: string;
}

// This function compiles TypeScript files from the collections folder into JavaScript files
export async function compile(options?: Partial<CompileOptions>): Promise<void> {
	const {
		// The default values for the folders are taken from the environment variables
		collectionsFolderJS = import.meta.env.collectionsFolderJS,
		collectionsFolderTS = import.meta.env.collectionsFolderTS
	} = options ?? {};

	// console.log('Starting compilation...');
	// console.log(`collectionsFolderJS: ${collectionsFolderJS}`);
	// console.log(`collectionsFolderTS: ${collectionsFolderTS}`);
	logger.info('Starting compilation process', { collectionsFolderJS, collectionsFolderTS });

	// This global variable is used to store the current file name
	globalThis.__filename = '';

	try {
		// If the collections folder for JavaScript does not exist, create it
		// console.log(`Creating directory: ${collectionsFolderJS}`);
		await fs.mkdir(collectionsFolderJS, { recursive: true });

		// Get the list of TypeScript files from the collections folder, excluding Auth.ts and index.ts
		const files = (await fs.readdir(collectionsFolderTS)).filter((file) => !['index.ts'].includes(file));
		// console.log(`Files to compile: ${files.join(', ')}`);
		logger.debug(`Files to compile: ${files.join(', ')}`);

		await Promise.all(files.map((file) => compileFile(file, collectionsFolderTS, collectionsFolderJS)));

		// console.log('Compilation complete.');
		logger.info('Compilation process completed successfully');
	} catch (error: unknown) {
		if (error instanceof Error) {
			logger.error('Error during compilation process', { error: error.message });
		} else {
			logger.error('Unknown error during compilation process');
		}
		throw error;
	}
}

async function compileFile(file: string, sourcePath: string, destPath: string): Promise<void> {
	const tsFilePath = path.join(sourcePath, file);
	const jsFilePath = path.join(destPath, file.replace(/\.ts$/g, '.js'));

	try {
		// console.log(`Compiling ${tsFilePath} to ${jsFilePath}`);

		// Read the TS file as a string
		const content = await fs.readFile(tsFilePath, 'utf-8');
		const contentHash = crypto.createHash('md5').update(content).digest('hex');

		if (await shouldRecompile(jsFilePath, tsFilePath, contentHash)) {
			const code = await transpileModule(content, tsFilePath);
			// Prepend the content hash to the JS file
			await fs.writeFile(jsFilePath, `// ${contentHash}\n${code}`);
			// console.log(`Compiled and wrote ${jsFilePath}`);
			logger.debug(`Compiled and wrote ${jsFilePath}`);
		} else {
			// console.log(`Skipping compilation for ${file}, no changes detected.`);
			logger.debug(`Skipping compilation for ${file}, no changes detected.`);
		}
	} catch (error: unknown) {
		// console.error(`Error compiling ${file}: ${error}`);
		if (error instanceof Error) {
			logger.error(`Error compiling ${file}`, { error: error.message });
		} else {
			logger.error(`Unknown error compiling ${file}`);
		}
		throw error;
	}
}

async function shouldRecompile(jsFilePath: string, tsFilePath: string, newContentHash: string): Promise<boolean> {
	try {
		const [jsStats, tsStats] = await Promise.all([fs.stat(jsFilePath).catch(() => null), fs.stat(tsFilePath)]);

		if (!jsStats) return true;

		// Read the existing JS file and extract the hash
		const existingContent = await fs.readFile(jsFilePath, 'utf-8');
		const existingHash = existingContent.split('\n')[0].replace('// ', '');

		// Compare hashes and modification times to determine if recompilation is necessary
		return newContentHash !== existingHash || tsStats.mtime > jsStats.mtime;
	} catch {
		return true;
	}
}

async function transpileModule(content: string, tsFilePath: string): Promise<string> {
	// Check if the module is cached
	let code = cache.get(tsFilePath);

	if (!code) {
		// Import TypeScript dynamically
		const ts = (await import('typescript')).default;

		// Transpile the TypeScript code into JavaScript code using the ESNext target
		code = ts.transpileModule(content, {
			compilerOptions: { target: ts.ScriptTarget.ESNext }
		}).outputText;

		// Replace the import statements for widgets with an empty string
		code = code
			.replace(/import widgets from .*\n/g, '')
			// Replace the widgets variable with the globalThis.widgets variable
			.replace(/widgets/g, 'globalThis.widgets')
			// Add the .js extension to the relative import paths
			.replace(/(\bfrom\s+["']\..*)(["'])/g, '$1.js$2');

		// Cache the transpiled module
		cache.set(tsFilePath, code);
	}

	return code;
}
