import type { RequestHandler } from './$types';
import { getCollectionModels } from '@src/routes/api/db';

export const PATCH: RequestHandler = async ({ params, request }) => {
	const collections = await getCollectionModels();
	const collection = collections[params.collection];
	const data = await request.formData();

	let ids = data.get('ids') as string;
	const status = data.get('status') as string;
	ids = JSON.parse(ids);

	console.log(ids);
	console.log(typeof ids);

	return new Response(
		JSON.stringify(
			await collection.updateMany(
				{
					_id: {
						$in: ids
					}
				},
				{ status }
			)
		)
	);
};
