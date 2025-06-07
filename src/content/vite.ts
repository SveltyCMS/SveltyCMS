/**
 * @file src/content/vite.ts
 * @description Vite plugin for generating TypeScript types for Content
 *
 * Features:
 * - Generate TypeScript types for collections
 */

import fs from 'fs';

export async function generateContentTypes(server) {
	try {
		const { collections } = await server.ssrLoadModule('@src/stores/collectionStore.svelte.ts');

		const contentTypes: Record<string, { fields: string[]; type: string }> = {};

		// Access the store's value property and ensure it exists
		const collectionsData = collections?.value || {};

		if (!collectionsData || typeof collectionsData !== 'object') {
			throw new Error(`Invalid collections data: ${JSON.stringify(collectionsData)}`);
		}

		for (const [key, collection] of Object.entries(collectionsData)) {
			if (!collection?.fields) {
				console.warn(`Collection ${key} has no fields:`, collection);
				continue;
			}

			const fields = collection.fields.map((field) => ({
				name: field.db_fieldName || field.label,
				type: field.type || 'string'
			}));

			contentTypes[key] = {
				fields: fields.map((f) => f.name),
				type: `{${fields.map((f) => `${f.name}: ${f.type}`).join('; ')}}`
			};
		}

		let types = await fs.promises.readFile('src/content/types.ts', 'utf-8');
		types = types.replace(/\n*export\s+type\s+ContentTypes\s?=\s?.*?};/gms, '');
		types += '\nexport type ContentTypes = ' + JSON.stringify(contentTypes, null, 2) + ';\n';

		await fs.promises.writeFile('src/content/types.ts', types);

		return contentTypes;
	} catch (error) {
		console.error('Error generating collection types:', error);
		throw error;
	}
}
