import { json } from '@sveltejs/kit';
import { generateCollectionTypes, generateCollectionFieldTypes } from '@utils/collectionTypes';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function GET() {
	try {
		// Generate the collection types
		await generateCollectionTypes();
		await generateCollectionFieldTypes();

		// Read the generated types file
		const typesPath = join(__dirname, '..', '..', '..', 'collections', 'types.ts');
		const typesContent = readFileSync(typesPath, 'utf-8');

		// Extract CollectionNames from the content
		const match = typesContent.match(/export\s+type\s+CollectionNames\s?=\s?(.*?);/);
		if (match) {
			const collections = match[1].split('|').map((name) => name.replace(/['"]/g, ''));
			return json(collections);
		}

		throw new Error('Failed to extract CollectionNames');
	} catch (error) {
		console.error('Error in /api/collections:', error);
		return json({ error: 'Failed to fetch collections' }, { status: 500 });
	}
}
