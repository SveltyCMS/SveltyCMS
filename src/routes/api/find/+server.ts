import type { RequestHandler } from './$types';
import { collections } from '$src/lib/utils/db';

export const GET: RequestHandler = async ({ url }) => {
	const collection = collections[url.searchParams.get('collection') as string];
	// return new Response(await collection.find(url.searchParams.get("id") as string))
	const resp = JSON.stringify(
		await collection.find(JSON.parse(url.searchParams.get('query') as string))
	);
	return new Response(resp);
};
