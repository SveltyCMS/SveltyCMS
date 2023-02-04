import type { RequestHandler } from './$types';
import { collections } from '$src/lib/utils/db';
import { parse, saveFiles } from '$src/lib/utils/utils';

export const GET: RequestHandler = async ({ params, url }) => {
	let page = parseInt(url.searchParams.get('page') as string) || 1;
	let collection = collections[params.collection];
	let length = parseInt(url.searchParams.get('length') as string) || Infinity;
	let skip = (page - 1) * length;

	return new Response(
		JSON.stringify({
			entryList: await collection.find().skip(skip).limit(length),
			totalCount: await collection.countDocuments()
		})
	);
};

export const PATCH: RequestHandler = async ({ params, request }) => {
	let collection = collections[params.collection];
	let data = await request.formData();
	let formData: any = {};
	for (let key of data.keys()) {
		try {
			formData[key] = JSON.parse(data.get(key) as string);
		} catch (e) {
			formData[key] = data.get(key) as string;
		}
	}
	let _id = data.get('_id');
	formData = parse(formData);
	let files = saveFiles(data, params.collection);

	return new Response(
		JSON.stringify(await collection.updateOne({ _id }, { ...formData, ...files }, { upsert: true }))
	);
};

export const POST: RequestHandler = async ({ params, request }) => {
	let collection = collections[params.collection];
	let data = await request.formData();
	let body: any = {};
	for (let key of data.keys()) {
		try {
			body[key] = JSON.parse(data.get(key) as string);
		} catch (e) {
			body[key] = data.get(key) as string;
		}
	}
	if (!collection) return new Response('collection not found!!');
	let files = saveFiles(data, params.collection);

	return new Response(JSON.stringify(await collection.insertMany({ ...body, ...files })));
};

export const DELETE: RequestHandler = async ({ params, request }) => {
	let collection = collections[params.collection];
	let data = await request.formData();

	let ids = data.get('ids') as string;
	ids = JSON.parse(ids);
	console.log(ids);
	console.log(typeof ids);

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
