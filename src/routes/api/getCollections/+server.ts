/**
 * @file src/routes/api/getCollections/+server.ts
 * @description
 * API endpoint for retrieving collection files or a specific collection file.
 */
 
import type { RequestHandler } from '@sveltejs/kit';
import { getCollectionFiles } from './getCollectionFiles';
import { json } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ locals }) => {
    const userId = locals?.user?._id
    if(!userId){
         return json([]); // or return error
    }
    const files = await getCollectionFiles(userId);
    return json(files);
};