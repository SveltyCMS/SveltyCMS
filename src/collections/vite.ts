/**
 * @file src/collections/vite.ts
 * @description Vite plugin for generating TypeScript types for collections
 */

import fs from 'fs';

export async function generateCollectionTypes(server) {
    try {
        const { collections } = await server.ssrLoadModule('@src/stores/store.svelte.ts');
        const collectionTypes: Record<string, { fields: string[]; type: string }> = {};
        
        for (const [key, collection] of Object.entries(collections())) {
            const fields = collection.fields.map(field => ({
                name: field.db_fieldName || field.label,
                type: field.type || 'string'
            }));
            
            collectionTypes[collection.path] = {
                fields: fields.map(f => f.name),
                type: `{${fields.map(f => `${f.name}: ${f.type}`).join('; ')}}`
            };
        }

        let types = await fs.promises.readFile('src/collections/types.ts', 'utf-8');
        types = types.replace(/\n*export\s+type\s+CollectionTypes\s?=\s?.*?};/gms, '');
        types += '\nexport type CollectionTypes = ' + JSON.stringify(collectionTypes, null, 2) + ';\n';
        
        await fs.promises.writeFile('src/collections/types.ts', types);
        
        return collectionTypes;
    } catch (error) {
        console.error('Error generating collection types:', error);
        throw error;
    }
}
