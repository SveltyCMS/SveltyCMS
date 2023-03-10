import type { RequestHandler } from './$types';
import { collections } from '$src/lib/utils/db';
import { parse, saveFiles } from '$src/lib/utils/utils';

export const GET: RequestHandler = async ({ params, url }) => {
	const page = parseInt(url.searchParams.get('page') as string) || 1;
	const collection = collections[params.collection];
	const length = parseInt(url.searchParams.get('length') as string) || Infinity;
	const skip = (page - 1) * length;

	return new Response(
		JSON.stringify({
			entryList: await collection.find().skip(skip).limit(length).sort({ updatedAt: 'desc' }),
			totalCount: await collection.countDocuments()
		})
	);
};

export const PATCH: RequestHandler = async ({ params, request }) => {
	const collection = collections[params.collection];
	const data = await request.formData();
	let formData: any = {};
	for (const key of data.keys()) {
		try {
			formData[key] = JSON.parse(data.get(key) as string);
		} catch (e) {
			formData[key] = data.get(key) as string;
		}
	}
	const _id = data.get('_id');
	formData = parse(formData);
	const files = saveFiles(data, params.collection);

	return new Response(
		JSON.stringify(await collection.updateOne({ _id }, { ...formData, ...files }, { upsert: true }))
	);
};

export const POST: RequestHandler = async ({ params, request }) => {
	const collection = collections[params.collection];
	const data = await request.formData();

	const body: any = {};
	for (const key of data.keys()) {
		try {
			body[key] = JSON.parse(data.get(key) as string);
		} catch (e) {
			body[key] = data.get(key) as string;
		}
	}
	if (!collection) return new Response('collection not found!!');

	const files = saveFiles(request, params.collection);

	return new Response(JSON.stringify(await collection.insertMany({ ...body, ...files })));
};

export const DELETE: RequestHandler = async ({ params, request }) => {
	const collection = collections[params.collection];
	const data = await request.formData();

	let ids = data.get('ids') as string;
	ids = JSON.parse(ids);
	//.log(ids);
	// console.log(typeof ids);

	return new Response(
		JSON.stringify(
			await collection.deleteMany({
				_id: {
					$in: ids
				}
			})
		)
	);
};
