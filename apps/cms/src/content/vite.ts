/**
 * @file apps/cms/src/content/vite.ts
 * @description Vite plugin for generating TypeScript types for Content
 *
 * Features:
 * - Generate TypeScript types for collections
 * - Write types to src/content/types.ts
 * - Validate collection fields
 * - Generate proper TypeScript union types
 */

import { logger } from '@shared/utils/logger';
import * as fs from 'node:fs/promises';
import type { ViteDevServer } from 'vite';

// Define types locally to avoid circular dependencies
interface Field {
	db_fieldName?: string;
	label: string;
	type?: string;
}

interface ProcessedField {
	name: string;
	type: string;
}

export async function generateContentTypes(server: ViteDevServer): Promise<Record<string, { fields: string[]; type: string }>> {
	try {
		// Load ContentManager from server-side (not client store!)
		const { contentManager } = await server.ssrLoadModule('./src/content/ContentManager.ts');

		// Initialize ContentManager and get collections
		await contentManager.initialize();
		const collectionsData = await contentManager.getCollections();

		const contentTypes: Record<string, { fields: string[]; type: string }> = {};

		if (!collectionsData || !Array.isArray(collectionsData)) {
			throw new Error(`Invalid collections data: expected array, got ${typeof collectionsData}`);
		}

		for (const collection of collectionsData) {
			if (!collection?.fields || !Array.isArray(collection.fields)) {
				logger.warn(`Collection ${collection?.name || 'unknown'} has no valid fields array`);
				continue;
			}

			const processedFields: ProcessedField[] = collection.fields.map((field: Field) => ({
				name: field.db_fieldName || field.label,
				type: field.type || 'string'
			}));

			// Use collection name or _id as key
			const collectionKey = collection.name || collection._id;
			contentTypes[collectionKey] = {
				fields: processedFields.map((f) => f.name),
				type: `{${processedFields.map((f) => `${f.name}: ${f.type}`).join('; ')}}`
			};
		}

		// Read existing types file
		let types = await fs.readFile('src/content/types.ts', 'utf-8');

		// Generate new ContentTypes union
		const collectionNames = Object.keys(contentTypes)
			.map((name) => `'${name}'`)
			.join(' | ');

		const newTypeDefinition = `/* AUTOGEN_START: ContentTypes */\nexport type ContentTypes = ${collectionNames || 'never'};\n/* AUTOGEN_END: ContentTypes */`;

		// Replace the block between markers
		const markerStart = '/* AUTOGEN_START: ContentTypes */';
		const markerEnd = '/* AUTOGEN_END: ContentTypes */';

		const startIndex = types.indexOf(markerStart);
		const endIndex = types.indexOf(markerEnd);

		if (startIndex !== -1 && endIndex !== -1) {
			types = types.substring(0, startIndex) + newTypeDefinition + types.substring(endIndex + markerEnd.length);
		} else {
			// Fallback: append if markers are missing (though they should have been added by now)
			logger.warn('AUTOGEN markers not found in types.ts, appending to end of file');
			types += `\n${newTypeDefinition}\n`;
		}

		// Write updated types
		await fs.writeFile('src/content/types.ts', types);

		logger.info(`Generated types for ${Object.keys(contentTypes).length} collections`);
		return contentTypes;
	} catch (error) {
		logger.error('Error generating collection types:', error);
		throw error;
	}
}
