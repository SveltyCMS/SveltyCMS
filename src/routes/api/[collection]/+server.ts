// Import the necessary modules.
import { getCollections } from '@src/collections';
import type { RequestHandler } from './$types';
import { auth, getCollectionModels } from '@src/routes/api/db';
import { getFieldName, parse, saveImages, validate } from '@src/utils/utils';
import { DEFAULT_SESSION_COOKIE_NAME } from 'lucia';
import widgets from '@src/components/widgets';
import type { Schema } from '@src/collections/types';
import { PUBLIC_CONTENT_LANGUAGES } from '$env/static/public';

// Define the GET request handler.
export const GET: RequestHandler = async ({ params, url, cookies }) => {
	// Get the session cookie.
	const session = cookies.get(DEFAULT_SESSION_COOKIE_NAME) as string;

	// Validate the session.
	const user = await validate(auth, session);

	// Get the collection schema.
	const collection_schema = (await getCollections()).find((c: any) => c.name == params.collection) as Schema;

	// Check if the user has read access to the collection.
	const has_read_access = (await getCollections()).find((c: any) => c.name == params.collection)?.permissions?.[user.user.role]?.read ?? true;
	if (user.status != 200 || !has_read_access) {
		return new Response('', { status: 403 });
	}

	// Get the collection model.
	const collections = await getCollectionModels();
	const collection = collections[params.collection];

	// Get the page number, length, filter, and sort from the URL parameters.
	const page = parseInt(url.searchParams.get('page') as string) || 1;
	const length = parseInt(url.searchParams.get('length') as string) || Infinity;
	const filter: { [key: string]: string } = JSON.parse(url.searchParams.get('filter') as string) || {};
	const sort: { [key: string]: number } = JSON.parse(url.searchParams.get('sort') as string) || {};

	// Get the content language from the URL parameters.
	const contentLanguage = JSON.parse(url.searchParams.get('contentLanguage') as string) || PUBLIC_CONTENT_LANGUAGES;

	// Calculate the skip value.
	const skip = (page - 1) * length;

	// Create an array of aggregation pipelines.
	const aggregations: any = [];

	// Loop through the collection schema fields.
	for (const field of collection_schema.fields) {
		// Get the widget for the field.
		const widget = widgets[field.widget.key];

		// Get the field name.
		const fieldName = getFieldName(field);

		// If the widget has aggregations, add them to the aggregations array.
		if ('aggregations' in widget) {
			// Get the filter and sort for the field.
			const _filter = filter[fieldName];
			const _sort = sort[fieldName];

			// If the widget has transformation aggregations, add them to the aggregations array.
			if (widget.aggregations.transformations) {
				const _aggregations = await widget.aggregations.transformations({ field, contentLanguage: contentLanguage });
				aggregations.push(..._aggregations);
			}

			// If the widget has filter aggregations, add them to the aggregations array.
			if (widget.aggregations.filters && _filter) {
				const _aggregations = await widget.aggregations.filters({ field, contentLanguage: contentLanguage, filter: _filter });
				aggregations.push(..._aggregations);
			}

			// If the widget has sort aggregations, add them to the aggregations array.
			if (widget.aggregations.sorts && _sort) {
				const _aggregations = await widget.aggregations.sorts({ field, contentLanguage: contentLanguage, sort: _sort });
				aggregations.push(..._aggregations);
			}
		}
	}

	// Log the aggregations.
	console.log(aggregations);

	// Aggregate the collection.
	const entryListWithCount = await collection.aggregate([
		{
			$facet: {
				entries: [...aggregations, { $skip: skip }, { $limit: length }],
				totalCount: [...aggregations, { $count: 'total' }]
			}
		}
	]);

	// Get the entry list and total count from the aggregation results.
	const entryList = entryListWithCount[0].entries;
	const totalCount = entryListWithCount[0].totalCount[0] ? entryListWithCount[0].totalCount[0].total : 0;

	// Calculate the number of pages.
	const pagesCount = Math.ceil(totalCount / length);

	// Return the entry list and pages count as a JSON response.
	return new Response(
		JSON.stringify({
			entryList,
			pagesCount
		})
	);
};

// Define the PATCH request handler.
export const PATCH: RequestHandler = async ({ params, request, cookies }) => {
	// Get the session cookie.
	const session = cookies.get(DEFAULT_SESSION_COOKIE_NAME) as string;

	// Validate the session.
	const user = await validate(auth, session);

	// Check if the user has write access to the collection.
	const has_write_access = (await getCollections()).find((c: any) => c.name == params.collection)?.permissions?.[user.user.role]?.write ?? true;
	if (user.status != 200 || !has_write_access) {
		return new Response('', { status: 403 });
	}

	// Get the collection model.
	const collections = await getCollectionModels();
	const collection = collections[params.collection];

	// Get the form data.
	const data = await request.formData();

	// Parse the form data.
	let formData: any = {};
	for (const key of data.keys()) {
		try {
			formData[key] = JSON.parse(data.get(key) as string);
		} catch (e) {
			formData[key] = data.get(key) as string;
		}
	}

	// Get the _id of the entry.
	const _id = data.get('_id');

	// Parse the form data.
	formData = parse(formData);

	// Save the images.
	const files = await saveImages(data, params.collection);

	// Update the entry.
	return new Response(JSON.stringify(await collection.updateOne({ _id }, { ...formData, ...files }, { upsert: true })));
};

// Define the POST request handler.
export const POST: RequestHandler = async ({ params, request, cookies }) => {
	// Get the session cookie.
	const session = cookies.get(DEFAULT_SESSION_COOKIE_NAME) as string;

	// Validate the session.
	const user = await validate(auth, session);

	// Check if the user has write access to the collection.
	const has_write_access = (await getCollections()).find((c: any) => c.name == params.collection)?.permissions?.[user.user.role]?.write ?? true;
	if (user.status != 200 || !has_write_access) {
		return new Response('', { status: 403 });
	}

	// Get the collection model.
	const collections = await getCollectionModels();
	const collection = collections[params.collection];

	// Get the form data.
	const data = await request.formData();

	// Parse the form data.
	const body: any = {};
	for (const key of data.keys()) {
		try {
			body[key] = JSON.parse(data.get(key) as string);
		} catch (e) {
			body[key] = data.get(key) as string;
		}
	}

	// Set the status to published.
	body['status'] = 'published';

	// Check if the collection exists.
	if (!collection) return new Response('collection not found!!');

	// Save the images.
	const files = await saveImages(data, params.collection);

	// Insert the entry.
	return new Response(JSON.stringify(await collection.insertMany({ ...body, ...files })));
};

// Define the DELETE request handler.
export const DELETE: RequestHandler = async ({ params, request, cookies }) => {
	// Get the session cookie.
	const session = cookies.get(DEFAULT_SESSION_COOKIE_NAME) as string;

	// Validate the session.
	const user = await validate(auth, session);

	// Check if the user has write access to the collection.
	const has_write_access = (await getCollections()).find((c: any) => c.name == params.collection)?.permissions?.[user.user.role]?.write ?? true;
	if (user.status != 200 || !has_write_access) {
		return new Response('', { status: 403 });
	}

	// Get the collection model.
	const collections = await getCollectionModels();
	const collection = collections[params.collection];

	// Get the form data.
	const data = await request.formData();

	// Get the ids of the entries to delete.
	let ids = data.get('ids') as string;
	ids = JSON.parse(ids);

	// Delete the entries.
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
