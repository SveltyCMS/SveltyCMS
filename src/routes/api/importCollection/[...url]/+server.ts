import type { RequestHandler } from './$types';
import fs from 'fs';
import mime from 'mime-types';

export const GET: RequestHandler = async ({ params }) => {
	const data = await fs.promises.readFile(`${import.meta.env.collectionsFolderJS}/${params.url}`);
	return new Response(data, {
		headers: {
			'Content-Type': mime.lookup(params.url) as string
		}
	});
};