/**
 * @file src/routes/api/getCollection/[collectionId]/+server.ts
 * @description API endpoint for retrieving a single collection's data.
 */
import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { contentManager } from '@src/content/ContentManager';

export const GET: RequestHandler = async ({ params }) => {
    try {
        const { collectionId } = params;
        const collection = await contentManager.getCollection(collectionId);

        if (!collection) {
            return json({ error: 'Collection not found' }, { status: 404 });
        }

        return json(collection);
    } catch (error) {
        console.error('Error retrieving collection:', error);
        return json({ error: 'Failed to retrieve collection' }, { status: 500 });
    }
};
