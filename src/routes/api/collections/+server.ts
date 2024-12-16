import { json } from '@sveltejs/kit';
import { contentManager } from '@src/content/ContentManager';

export const GET = async () => {
    try {
        const collections = await contentManager.loadCollections();
        return json(collections);
    } catch (error) {
        console.error('Error loading collections:', error);
        return new Response(JSON.stringify({ error: 'Failed to load collections' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
