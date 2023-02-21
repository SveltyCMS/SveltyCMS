import type { RequestHandler } from './$types';
import { collections } from '$src/lib/utils/db';

export const GET: RequestHandler = async ({ url }) => {
	const collection = collections[url.searchParams.get('collection') as string];
	const resp = JSON.stringify(await collection.findById(url.searchParams.get('id') as string));
	return new Response(resp);
};
