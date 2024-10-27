/**
 * @file collectionUpdater.ts
 * @description Lazy-load collections using dynamic imports in a SvelteKit CMS project.
 *
 * This file contains two main functions:
 * 1. updateImports(): Updates the imports in the index file of the collections directory.
 *    It now supports lazy-loading using dynamic imports.
 * 2. getCollection(): Function to dynamically import a specific collection when needed.
 *
 * The updateImports function updates the index.ts file to enable dynamic collection loading.
 * It also runs Prettier on the updated file to ensure consistent formatting.
 *
 * @requires child_process - For executing shell commands
 * @requires fs/promises - File system module with promise-based API
 * @requires path - Path manipulation utility
 * @requires @utils/logger - Custom logging utility
 */
import { exec } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '@utils/logger';

const COLLECTIONS_DIR = './src/collections';
const INDEX_FILE = path.join(COLLECTIONS_DIR, 'index.ts');
const EXCLUDED_FILES = new Set(['index.ts', 'types.ts', 'Auth.ts']);

// Update the index.ts file to include dynamic imports for collections
export async function updateImports(): Promise<void> {
	try {
		const files = await getCollectionFiles();
		const updatedContent = generateUpdatedContent(files);

		// Write the updated content to the index.ts file
		await fs.writeFile(INDEX_FILE, updatedContent);
		logger.info('Updated index.ts file with lazy loading for collections');
		await runPrettier();
	} catch (error) {
		logger.error('Error updating imports:', error as Error);
		throw error;
	}
}

// Recursively get all collection files from directories
async function getCollectionFiles(dir: string = COLLECTIONS_DIR): Promise<{ path: string; name: string }[]> {
	const entries = await fs.readdir(dir, { withFileTypes: true });
	const files: { path: string; name: string }[] = [];

	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await getCollectionFiles(fullPath)));
		} else if (entry.isFile() && entry.name.endsWith('.ts') && !EXCLUDED_FILES.has(entry.name)) {
			// Get relative path from collections directory
			const relativePath = path.relative(COLLECTIONS_DIR, fullPath);
			// Remove .ts extension for the name
			const name = path.basename(entry.name, '.ts');
			files.push({
				path: relativePath.replace(/\\/g, '/'), // Ensure forward slashes for imports
				name
			});
		}
	}

	return files;
}

// Generate dynamic import content for lazy loading collections
function generateUpdatedContent(files: { path: string; name: string }[]): string {
	const allCollections = `const allCollections = {\n${files
		.map(({ path: filePath, name }) => {
			return `  ${name}: () => import('./${filePath}'),`;
		})
		.join('\n')}\n};`;

	return `${allCollections}\n\nexport async function getCollection(name: string) {
  if (name in allCollections) {
    const collectionModule = await allCollections[name]();
    return collectionModule.default;
  }
  throw new Error(\`Collection "\${name}" not found\`);
}\n`;
}

// Run Prettier for consistent formatting
async function runPrettier(): Promise<void> {
	return new Promise((resolve, reject) => {
		exec('npx prettier ./src/collections --write', (error, stdout, stderr) => {
			if (error) {
				logger.error('Error running prettier:', error);
				reject(error);
			} else {
				logger.info('Prettier output:', { stdout, stderr });
				resolve();
			}
		});
	});
}
