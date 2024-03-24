import type { RequestHandler } from '@sveltejs/kit';
import { getCollectionFiles } from './getCollectionFiles';

export const GET: RequestHandler = async () => {
	const files = getCollectionFiles();

	return new Response(JSON.stringify(files));
};
