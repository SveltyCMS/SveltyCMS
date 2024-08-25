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
import { join } from 'path';

// Cache for transpiled modules
const cache = new Map();

// This function compiles TypeScript files from the collections folder into JavaScript files
export async function compile({
	collectionsFolderJS = import.meta.env.collectionsFolderJS,
	collectionsFolderTS = import.meta.env.collectionsFolderTS
} = {}) {
	// Ensure the output directory exists
	await fs.mkdir(collectionsFolderJS, { recursive: true });

	// Get list of TypeScript files to compile
	const files = (await fs.readdir(collectionsFolderTS)).filter((file) => !['index.ts'].includes(file));

	// Loop through each file
	for (const file of files) {
		try {
			const tsFilePath = join(collectionsFolderTS, file);
			const jsFilePath = join(collectionsFolderJS, file.replace(/\.ts$/, '.js'));

			// Check if JS file exists and if TS file has been modified since last compile
			let recompile = false;
			const tsStats = await fs.stat(tsFilePath);
			let jsStats;
			try {
				jsStats = await fs.stat(jsFilePath);
			} catch {
				// If the JS file doesn't exist, we need to recompile
				recompile = true;
			}

			// Create a hash of the TypeScript file content
			const contentHash = crypto
				.createHash('md5')
				.update(await fs.readFile(tsFilePath))
				.digest('hex');

			if (jsStats) {
				// Read the existing JavaScript file and extract the hash
				const existingContent = await fs.readFile(jsFilePath, { encoding: 'utf-8' });
				const existingHash = existingContent.split('\n')[0].replace('// ', '');

				// Compare hashes and modification times to determine if recompilation is necessary
				if (contentHash === existingHash && tsStats.mtime <= jsStats.mtime) {
					console.debug(`Skipping compilation for ${file}, no changes detected.`);
					continue; // No need to recompile
				}
			}

			// Read the TypeScript file
			const content = await fs.readFile(tsFilePath, { encoding: 'utf-8' });

			// Check if the module is cached
			let code = cache.get(tsFilePath);

			if (!code || recompile) {
				// Import TypeScript dynamically
				const ts = (await import('typescript')).default;

				// Transpile the TypeScript code into JavaScript code
				code = ts.transpileModule(content, {
					compilerOptions: {
						target: ts.ScriptTarget.ESNext
					}
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

			// Prepend the content hash to the JS file
			const contentHashUpdated = crypto.createHash('md5').update(content).digest('hex');
			code = `// ${contentHashUpdated}\n${code}`;

			// Write the content to the JS file
			await fs.writeFile(jsFilePath, code);

			// Log successful compilation
			console.debug(`Compiled and wrote ${jsFilePath}`);
		} catch (error) {
			// Always use the error object, so the variable is not unused
			if (error instanceof Error) {
				console.error(`Error compiling ${file}: ${error.message}`, error.stack);
			} else {
				console.error(`Unknown error compiling ${file}: ${String(error)}`);
			}
		}
	}
}
