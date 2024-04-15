// Import the necessary modules.
import { getCollections } from '@src/collections';
import type { RequestHandler } from './$types';
import { getFieldName, saveImages } from '@src/utils/utils';
import type { Schema } from '@src/collections/types';
import { publicEnv } from '@root/config/public';

// Components
import widgets from '@src/components/widgets';

// Auth
import { auth, getCollectionModels } from '@src/routes/api/db';
import { SESSION_COOKIE_NAME } from '@src/auth';
import type { User } from '@src/auth/types';

// Define the GET request handler.
export const GET: RequestHandler = async ({ params, url, cookies }) => {
	// Get the session cookie.
	const session_id = cookies.get(SESSION_COOKIE_NAME) as string;

	// Validate the session.
	const user_id = url.searchParams.get('user_id');
	const user = user_id ? ((await auth.checkUser({ _id: user_id })) as User) : ((await auth.validateSession(session_id)) as User);

	if (!user) {
		return new Response('', { status: 403 });
	}

	// Get the collection schema.
	const collection_schema = (await getCollections()).find((c: any) => c.name == params.collection) as Schema;

	// Check if the user has read access to the collection.
	const has_read_access = collection_schema?.permissions?.[user.role]?.read != false;

	if (!has_read_access) {
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
	const contentLanguage = JSON.parse(url.searchParams.get('contentLanguage') as string) || publicEnv.DEFAULT_CONTENT_LANGUAGE;

	// Calculate the skip value.
	const skip = (page - 1) * length;

	// Create an array of aggregation pipelines.
	const aggregations: any = [];
	if (sort.status) {
		aggregations.push({ $sort: { status: sort.status } });
	} else if (sort.createdAt) {
		aggregations.push({ $sort: { status: sort.createdAt } });
	} else if (sort.updatedAt) {
		aggregations.push({ $sort: { status: sort.updatedAt } });
	}

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
			if (widget.aggregations.filters && _filter) {
				const _aggregations = await widget.aggregations.filters({ field, contentLanguage: contentLanguage, filter: _filter });
				aggregations.push(..._aggregations);
			}

			// If the widget has filter aggregations, add them to the aggregations array.
			if (widget.aggregations.sorts && _sort) {
				const _aggregations = await widget.aggregations.sorts({ field, contentLanguage: contentLanguage, sort: _sort });
				aggregations.push(..._aggregations);
			}
		}
	}

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
	let entryList = entryListWithCount[0].entries;

	for (const field of collection_schema.fields) {
		const widget = widgets[field.widget.key];
		const fieldName = getFieldName(field);

		if (field?.permissions?.[user.role]?.read == false) {
			// if we cant read there is nothing to clean.
			entryList = entryList.map((entry: any) => {
				delete entry[fieldName];
				return entry;
			});
		} else if ('modifyRequest' in widget) {
			// widget can modify own portion of entryList;
			entryList = await Promise.all(
				entryList.map(async (entry: any) => {
					entry[fieldName] = await widget.modifyRequest({ collection, field, data: entry[fieldName], user, type: 'GET' });
					return entry;
				})
			);
		}
	}

	// Calculate the total count.
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
	const data = await request.formData();

	// Get the session cookie.
	const session_id = cookies.get(SESSION_COOKIE_NAME) as string;

	// Validate the session.
	const user_id = data.get('user_id') as string;
	const user = user_id ? ((await auth.get_user_by_id(user_id)) as User) : ((await auth.validateSession(session_id)) as User);

	// Check if the user has write access to the collection.
	if (!user) {
		return new Response('', { status: 403 });
	}

	// Check if the user has write access to the collection.
	const collection_schema = (await getCollections()).find((c: any) => c.name == params.collection) as Schema;
	const has_write_access = collection_schema?.permissions?.[user.role]?.write != false;

	if (!has_write_access) {
		return new Response('', { status: 403 });
	}

	// Get the collection model.
	const collections = await getCollectionModels();
	const collection = collections[params.collection];

	// Parse the form data.
	const body: any = {};
	for (const key of data.keys()) {
		try {
			body[key] = JSON.parse(data.get(key) as string, (key, value) => {
				if (value?.instanceof == 'File') {
					const file = data.get(value.id) as File;
					file.path = value.path;
					data.delete(value.id);
				}
				return value;
			});
		} catch (e) {
			body[key] = data.get(key) as string;
		}
	}

	// Get the _id of the entry.
	const _id = data.get('_id') as string;

	for (const field of collection_schema.fields) {
		const widget = widgets[field.widget.key];
		const fieldName = getFieldName(field);

		if (field?.permissions?.[user.role]?.write == false) {
			// if we cant write there is nothing to modify.
			delete body[fieldName];
		} else if ('modifyRequest' in widget) {
			// widget can modify own portion of body;
			body[fieldName] = await widget.modifyRequest({ collection, field, data: body[fieldName], user, type: 'PATCH', id: _id });
		}
	}

	// Save the images.
	await saveImages(body, params.collection);

	// Update the entry.
	return new Response(JSON.stringify(await collection.updateOne({ _id }, body, { upsert: true })));
};

// Define the POST request handler.
export const POST: RequestHandler = async ({ params, request, cookies }) => {
	// Get the form data.
	const data = await request.formData();

	// Get the session cookie.
	const session_id = cookies.get(SESSION_COOKIE_NAME) as string;

	// Validate the session.

	const user_id = data.get('user_id') as string;
	const user = user_id ? ((await auth.checkUser({ _id: user_id })) as User) : ((await auth.validateSession(session_id)) as User);

	// Check if the user has write access to the collection.
	if (!user) {
		return new Response('', { status: 403 });
	}

	// Check if the user has write access to the collection.
	const collection_schema = (await getCollections()).find((c: any) => c.name == params.collection) as Schema;
	console.log(collection_schema);
	const has_write_access = (await getCollections()).find((c: any) => c.name == params.collection)?.permissions?.[user.role]?.write;
	console.log(has_write_access);
	if (!has_write_access) {
		return new Response('', { status: 403 });
	}

	// Get the collection model.
	const collections = await getCollectionModels();
	const collection = collections[params.collection];

	// Parse the form data.
	const body: any = {};
	for (const key of data.keys()) {
		try {
			body[key] = JSON.parse(data.get(key) as string, (key, value) => {
				if (value?.instanceof == 'File') {
					const file = data.get(value.id) as File;
					file.path = value.path;
					data.delete(value.id);
					return file;
				}
				return value;
			});
		} catch (e) {
			body[key] = data.get(key) as string;
		}
	}

	// Set the status to published.
	body['status'] = 'published';

	// Check if the collection exists.
	if (!collection) return new Response('Collection not found!!');

	for (const field of collection_schema.fields) {
		const widget = widgets[field.widget.key];
		const fieldName = getFieldName(field);

		if (field?.permissions?.[user.role]?.write == false) {
			// if we cant read there is nothing to modify.
			delete body[fieldName];
		} else if ('modifyRequest' in widget) {
			// widget can modify own portion of body;

			body[fieldName] = await widget.modifyRequest({ collection, field, data: body[fieldName], user, type: 'POST' });
		}
	}
	// Save the images.
	await saveImages(body, params.collection);

	// Insert the entry.
	return new Response(JSON.stringify(await collection.insertMany(body)));
};

// Define the DELETE request handler.
export const DELETE: RequestHandler = async ({ params, request, cookies }) => {
	// Get the form data.
	const data = await request.formData();

	// Get the session cookie.
	const session_id = cookies.get(SESSION_COOKIE_NAME) as string;

	// Validate the session.
	const user_id = data.get('user_id') as string;
	const user = user_id ? ((await auth.checkUser({ _id: user_id })) as User) : ((await auth.validateSession(session_id)) as User);

	// Check if the user has write access to the collection.
	if (!user) {
		return new Response('', { status: 403 });
	}

	// Check if the user has write access to the collection.
	const has_write_access = (await getCollections()).find((c: any) => c.name == params.collection)?.permissions?.[user.role]?.write;

	if (!has_write_access) {
		return new Response('', { status: 403 });
	}

	// Get the collection model.
	const collections = await getCollectionModels();
	const collection = collections[params.collection];

	// Get the ids of the entries to delete.
	let ids = data.get('ids') as string;
	ids = JSON.parse(ids);
	// console.log(ids);

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
