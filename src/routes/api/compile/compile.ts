/**
 * @file src/routes/api/compile/compile.ts
 * @description Compiles TypeScript files from the collections folder into JavaScript files.
 *
 * Features:
 * - File caching to avoid unnecessary recompilation.
 * - Content hashing for change detection.
 * - Asynchronous file operations for improved performance.
 * - Error handling and logging.
 *
 * Usage:
 * import { compile } from './compile';
 * await compile();
 */

import fs from 'fs/promises';
import crypto from 'crypto';
import { join } from 'path';

// Cache for transpiled modules to avoid recompiling unchanged files
const cache = new Map();

// Compiles TypeScript files from the collections folder into JavaScript files.
export async function compile({
	collectionsFolderJS = import.meta.env.collectionsFolderJS,
	collectionsFolderTS = import.meta.env.collectionsFolderTS
} = {}): Promise<void> {
	// Ensure the output directory exists (create it if necessary)
	await fs.mkdir(collectionsFolderJS, { recursive: true });

	// Get a list of TypeScript files to compile, excluding 'index.ts'
	const files = (await fs.readdir(collectionsFolderTS)).filter((file) => !['index.ts'].includes(file));

	// Loop through each file to handle compilation
	for (const file of files) {
		try {
			const tsFilePath = join(collectionsFolderTS, file);
			const jsFilePath = join(collectionsFolderJS, file.replace(/\.ts$/, '.js'));

			// Flag to determine if recompilation is necessary
			let recompile = false;

			// Get file stats for the TypeScript file
			const tsStats = await fs.stat(tsFilePath);
			let jsStats;

			try {
				// Get file stats for the existing JavaScript file (if it exists)
				jsStats = await fs.stat(jsFilePath);
			} catch {
				// If the JS file doesn't exist, mark for recompilation
				recompile = true;
			}

			// Create a hash of the TypeScript file content for change detection
			const contentHash = crypto
				.createHash('md5')
				.update(await fs.readFile(tsFilePath))
				.digest('hex');

			if (jsStats) {
				// Read the existing JavaScript file and extract the hash from the first line
				const existingContent = await fs.readFile(jsFilePath, { encoding: 'utf-8' });
				const existingHash = existingContent.split('\n')[0].replace('// ', '');

				// Compare the content hashes and modification times to decide on recompilation
				if (contentHash === existingHash && tsStats.mtime <= jsStats.mtime) {
					console.debug(`Skipping compilation for ${file}, no changes detected.`);
					continue; // No need to recompile this file
				}
			}

			// Read the TypeScript file content
			const content = await fs.readFile(tsFilePath, { encoding: 'utf-8' });

			// Check the cache for the transpiled module
			let code = cache.get(tsFilePath);

			if (!code || recompile) {
				// Dynamically import TypeScript for transpiling
				const ts = (await import('typescript')).default;

				// Transpile the TypeScript code into JavaScript
				code = ts.transpileModule(content, {
					compilerOptions: {
						target: ts.ScriptTarget.ESNext
					}
				}).outputText;

				// Modify the transpiled code to fit the project's requirements
				code = code
					.replace(/import widgets from .*\n/g, '') // Remove widget imports
					.replace(/widgets/g, 'globalThis.widgets') // Replace widget references with globalThis.widgets
					.replace(/(\bfrom\s+["']\..*)(["'])/g, '$1.js$2'); // Add .js extension to relative import paths

				// Cache the transpiled code for future use
				cache.set(tsFilePath, code);
			}

			// Prepend the content hash to the JavaScript file for future comparison
			const contentHashUpdated = crypto.createHash('md5').update(content).digest('hex');
			code = `// ${contentHashUpdated}\n${code}`;

			// Write the transpiled JavaScript code to the output file
			await fs.writeFile(jsFilePath, code);

			// Log the successful compilation
			console.debug(`Compiled and wrote ${jsFilePath}`);
		} catch (error) {
			// Handle and log errors during the compilation process
			if (error instanceof Error) {
				console.error(`Error compiling ${file}: ${error.message}`, error.stack);
			} else {
				console.error(`Unknown error compiling ${file}: ${String(error)}`);
			}
		}
	}
}
