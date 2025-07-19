/**
 * @file src/utils/server-utils.ts
 * @description Server-side only utility functions that require Node.js modules.
 *
 * This file contains utilities that should only be used on the server-side,
 * as they depend on Node.js modules like 'fs' and 'path'.
 */

import fs from 'fs/promises';
import path from 'path';

// Collection name conflict checking types
interface CollectionNameCheck {
	exists: boolean;
	suggestions?: string[];
	conflictPath?: string;
}

export async function checkCollectionNameConflict(name: string, collectionsPath: string): Promise<CollectionNameCheck> {
	try {
		// Handle relative paths by joining with process.cwd()
		const absolutePath = path.isAbsolute(collectionsPath) ? collectionsPath : path.join(process.cwd(), collectionsPath);

		const files = await getAllCollectionFiles(absolutePath);
		const existingNames = new Set<string>();
		let conflictPath: string | undefined;

		// Build set of existing names and check for conflict
		for (const file of files) {
			const fileName = path.basename(file, '.ts');
			if (fileName === name) {
				// Convert absolute path to relative for display
				conflictPath = path.relative(process.cwd(), file);
			}
			existingNames.add(fileName);
		}

		if (conflictPath) {
			// Generate suggestions if there's a conflict
			const suggestions = generateNameSuggestions(name, existingNames);
			return { exists: true, suggestions, conflictPath };
		}

		return { exists: false };
	} catch (error) {
		console.error('Error checking collection name:', error);
		return { exists: false };
	}
}

async function getAllCollectionFiles(dir: string): Promise<string[]> {
	const files: string[] = [];
	const entries = await fs.readdir(dir, { withFileTypes: true });

	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await getAllCollectionFiles(fullPath)));
		} else if (
			entry.isFile() &&
			entry.name.endsWith('.ts') &&
			!entry.name.startsWith('_') &&
			!['index.ts', 'types.ts', 'ContentManager.ts'].includes(entry.name)
		) {
			files.push(fullPath);
		}
	}

	return files;
}

function generateNameSuggestions(name: string, existingNames: Set<string>): string[] {
	const suggestions: string[] = [];

	// Try adding numbers
	let counter = 1;
	while (suggestions.length < 3 && counter <= 99) {
		const suggestion = `${name}${counter}`;
		if (!existingNames.has(suggestion)) {
			suggestions.push(suggestion);
		}
		counter++;
	}

	// Try adding prefixes/suffixes if we need more suggestions
	const commonPrefixes = ['New', 'Alt', 'Copy'];
	for (const prefix of commonPrefixes) {
		if (suggestions.length >= 5) break;
		const suggestion = `${prefix}${name}`;
		if (!existingNames.has(suggestion)) {
			suggestions.push(suggestion);
		}
	}

	return suggestions;
}
