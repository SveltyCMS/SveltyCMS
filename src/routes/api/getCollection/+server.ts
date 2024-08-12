import { error, json, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url }) => {
	const fileNameQuery = url.searchParams.get('fileName');
	if (!fileNameQuery) return error(500, 'Query not found');
	const fileName = fileNameQuery.split('?')[0];
	const result = await import(/* @vite-ignore */ import.meta.env.collectionsFolderJS + fileName);
	const reqInit = {
		headers: {
			'Content-Type': 'application/javascript'
		}
	};
	return json(result, { ...reqInit });
};
