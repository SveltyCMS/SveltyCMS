// Import the necessary modules.
import { getCollections } from '@src/collections';
import type { RequestHandler } from './$types';
import { getFieldName, get_elements_by_id } from '@src/utils/utils';
import type { Schema } from '@src/collections/types';
import { publicEnv } from '@root/config/public';

// Components
import widgets from '@src/components/widgets';

// Auth
import { auth, getCollectionModels } from '@src/routes/api/db';
import { SESSION_COOKIE_NAME } from '@src/auth';
import type { User } from '@src/auth/types';
import mongoose from 'mongoose';

// Define the GET request handler.// Define the GET request handler.
export const GET: RequestHandler = async ({ params, url, cookies }) => {
	try {
		// Get the session cookie.
		const session_id = cookies.get(SESSION_COOKIE_NAME) as string;

		// Validate the session asynchronously.
		const user_id = url.searchParams.get('user_id');
		const user = user_id
			? ((await auth.checkUser({ _id: user_id })) as User)
			: ((await auth.validateSession(new mongoose.Types.ObjectId(session_id))) as User);

		// Check if the user has write access to the collection.
		if (!user) {
			return new Response('', { status: 403 });
		}

		// Get the collection schema asynchronously.
		const collection_schema = (await getCollections()).find((c) => c.name == params.collection) as Schema;
		// const collection_schema = (await getCollections().then((collections) => collections.find((c: any) => c.name == params.collection))) as Schema;

		// Check if the user has read access to the collection.
		const has_read_access = collection_schema?.permissions?.[user.role]?.read != false;

		if (!has_read_access) {
			return new Response('', { status: 403 });
		}

		// Get the collection model asynchronously.
		const collections = await getCollectionModels();
		const collection = collections[params.collection];

		// Get the page number, length, filter, and sort from the URL parameters asynchronously.
		const page = parseInt(url.searchParams.get('page') as string) || 1;
		const length = parseInt(url.searchParams.get('length') as string) || Infinity;
		const filter: { [key: string]: string } = JSON.parse(url.searchParams.get('filter') as string) || {};
		const sort: { [key: string]: number } = JSON.parse(url.searchParams.get('sort') as string) || {};

		// Get full Global Search URL.
		const search = url.searchParams.get('search') || '';

		// Get the content language from the URL parameters.
		const contentLanguage = (url.searchParams.get('contentLanguage') as string) || publicEnv.DEFAULT_CONTENT_LANGUAGE;

		// Calculate the skip value.
		const skip = (page - 1) * length;

		// Create an array of aggregation pipelines asynchronously.
		const aggregations: any = [];

		// Modify the aggregation pipeline based on the search query.
		if (search) {
			aggregations.push({
				$match: {
					$or: collection_schema.fields.map((field) => ({
						[getFieldName(field)]: { $regex: search, $options: 'i' }
					}))
				}
			});
		}
		if (sort.status) {
			aggregations.push({ $sort: { status: sort.status } });
		} else if (sort.createdAt) {
			aggregations.push({ $sort: { status: sort.createdAt } });
		} else if (sort.updatedAt) {
			aggregations.push({ $sort: { status: sort.updatedAt } });
		}

		// Loop through the collection schema fields asynchronously.
		await Promise.all(
			collection_schema.fields.map(async (field: any) => {
				const widget = widgets[field.widget.Name];
				// Get the field name.
				const fieldName = getFieldName(field);

				// If the widget has aggregations, add them to the aggregations array.
				if ('aggregations' in widget) {
					// Get the filter and sort for the field.
					const _filter = filter[fieldName];
					const _sort = sort[fieldName];

					// If the widget has transformation aggregations, add them to the aggregations array.
					if (widget.aggregations.filters && _filter) {
						const _aggregations = await widget.aggregations.filters({ field, contentLanguage, filter: _filter });
						aggregations.push(..._aggregations);
					}

					// If the widget has filter aggregations, add them to the aggregations array.
					if (widget.aggregations.sorts && _sort) {
						const _aggregations = await widget.aggregations.sorts({ field, contentLanguage, sort: _sort });
						aggregations.push(..._aggregations);
					}
				}
			})
		);

		// Aggregate the collection asynchronously.
		const entryListWithCount = await collection.aggregate([
			{
				$facet: {
					entries: [...aggregations, { $skip: skip }, { $limit: length }],
					totalCount: [...aggregations, { $count: 'total' }]
				}
			}
		]);

		// Get the entry list and total count asynchronously.
		let entryList = entryListWithCount[0].entries;

		// Modify entry list asynchronously.
		entryList = await Promise.all(
			entryList.map(async (entry: any) => {
				for (const field of collection_schema.fields) {
					const widget = widgets[field.widget.Name];
					const fieldName = getFieldName(field);

					if (field?.permissions?.[user.role]?.read == false) {
						delete entry[fieldName];
					} else if ('modifyRequest' in widget) {
						const data = {
							get() {
								return entry[fieldName];
							},
							update(newData: any) {
								entry[fieldName] = newData;
							}
						};
						await widget.modifyRequest({
							collection,
							field,
							data,
							user,
							type: 'GET',
							id: entry._id,
							meta_data: entry.meta_data
						});
					}
				}
				return entry;
			})
		);

		// Fetch elements by ID asynchronously.
		await get_elements_by_id.getAll();

		// Calculate total count and pages count.
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
	} catch (error) {
		console.error('Error handling GET request:', error);
		return new Response('Internal Server Error', { status: 500 });
	}
};

// Define the PATCH request handler.
export const PATCH: RequestHandler = async ({ params, request, cookies }) => {
	try {
		const data = await request.formData();

		// Get the session cookie.
		const session_id = cookies.get(SESSION_COOKIE_NAME) as string;

		// Validate the session asynchronously.
		const user_id = data.get('user_id') as string;
		const user = user_id
			? ((await auth.checkUser({ _id: user_id })) as User)
			: ((await auth.validateSession(new mongoose.Types.ObjectId(session_id))) as User);

		// Check if the user has write access to the collection.
		if (!user) {
			return new Response('', { status: 403 });
		}

		// Check if the user has write access to the collection.
		const collection_schema = (await getCollections().then((collections) => collections.find((c: any) => c.name == params.collection))) as Schema;
		const has_write_access = collection_schema?.permissions?.[user.role]?.write != false;

		if (!has_write_access) {
			return new Response('', { status: 403 });
		}

		// Get the collection model asynchronously.
		const collections = await getCollectionModels();
		const collection = collections[params.collection];

		// Parse the form data asynchronously.
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

		// Get the _id of the entry.
		const _id = data.get('_id') as string;

		for (const field of collection_schema.fields) {
			const widget = widgets[field.widget.Name];
			const fieldName = getFieldName(field);

			if ('modifyRequest' in widget) {
				// widget can modify own portion of body;
				const data = {
					get() {
						return body[fieldName];
					},
					update(newData) {
						body[fieldName] = newData;
					}
				};
				await widget.modifyRequest({
					collection,
					field,
					data,
					user,
					type: 'PATCH',
					id: new mongoose.Types.ObjectId(_id),
					meta_data: body._meta_data
				});
			}
		}

		if (body?._meta_data?.media_images?.removed) {
			await mongoose.models['media_images'].updateMany(
				{ _id: { $in: body?._meta_data?.media_images?.removed } },
				{ $pull: { used_by: new mongoose.Types.ObjectId(_id) } }
			);
		}

		// Update the entry asynchronously.
		console.log(body?._meta_data?.media_images?.removed);
		const response = await collection.updateOne({ _id }, body, { upsert: true });

		// Return the response as a JSON string.
		return new Response(JSON.stringify(response));
	} catch (error) {
		console.error('Error handling PATCH request:', error);
		return new Response('Internal Server Error', { status: 500 });
	}
};

// Define the POST request handler.
export const POST: RequestHandler = async ({ params, request, cookies }) => {
	try {
		// Get the form data.
		const data = await request.formData();
		// Get the session cookie.
		const session_id = cookies.get(SESSION_COOKIE_NAME) as string;

		// Validate the session asynchronously.
		const user_id = data.get('user_id') as string;

		const user = user_id
			? ((await auth.checkUser({ _id: user_id })) as User)
			: ((await auth.validateSession(new mongoose.Types.ObjectId(session_id))) as User);

		// Check if the user has write access to the collection.
		if (!user) {
			return new Response('', { status: 403 });
		}

		// Get the collection schema asynchronously.
		const collection_schema = (await getCollections()).find((c: any) => c.name == params.collection) as Schema;

		// Check if the user has write access to the collection.
		const has_write_access = collection_schema?.permissions?.[user.role]?.write != false;

		if (!has_write_access) {
			return new Response('', { status: 403 });
		}

		// Get the collection model asynchronously.
		const collections = await getCollectionModels();
		const collection = collections[params.collection];

		// Check if the collection exists.
		if (!collection) {
			return new Response('Collection not found!', { status: 404 });
		}

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

		if (!collection) return new Response('collection not found!!');
		body._id = new mongoose.Types.ObjectId();

		// Loop through the collection schema fields asynchronously.
		await Promise.all(
			collection_schema.fields.map(async (field: any) => {
				const widget = widgets[field.widget.Name];
				const fieldName = getFieldName(field);

				if (field?.permissions?.[user.role]?.write === false) {
					// If we can't write, there is nothing to modify.
					delete body[fieldName];
				} else if ('modifyRequest' in widget) {
					// Widget can modify its own portion of the body.
					const data = {
						get() {
							return body[fieldName];
						},
						update(newData) {
							body[fieldName] = newData;
						}
					};
					await widget.modifyRequest({
						collection,
						field,
						data,
						user,
						type: 'POST',
						id: body._id,
						meta_data: body._meta_data
					});
				}
			})
		);

		// Insert the entry asynchronously.
		const insertedEntry = await collection.insertMany(body);

		// Return the inserted entry as a JSON response.
		return new Response(JSON.stringify(insertedEntry));
	} catch (error) {
		console.error('Error handling POST request:', error);
		return new Response('Internal Server Error', { status: 500 });
	}
};

// Define the DELETE request handler.
export const DELETE: RequestHandler = async ({ params, request, cookies }) => {
	try {
		// Get the form data.
		const data = await request.formData();

		// Get the session cookie.
		const session_id = cookies.get(SESSION_COOKIE_NAME) as string;

		// Validate the session asynchronously.
		const user_id = data.get('user_id') as string;
		const user = user_id
			? ((await auth.checkUser({ _id: user_id })) as User)
			: ((await auth.validateSession(new mongoose.Types.ObjectId(session_id))) as User);

		// Check if the user has write access to the collection.
		if (!user) {
			return new Response('', { status: 403 });
		}

		// Get the collection schema asynchronously.
		const collection_schema = (await getCollections()).find((c: any) => c.name == params.collection) as Schema;

		// Check if the user has write access to the collection.
		const has_write_access = collection_schema?.permissions?.[user.role]?.write != false;

		if (!has_write_access) {
			return new Response('', { status: 403 });
		}

		// Get the collection model asynchronously.
		const collections = await getCollectionModels();
		const collection = collections[params.collection];

		// Get the ids of the entries to delete.
		let ids = data.get('ids') as string;
		ids = JSON.parse(ids);

		// Delete the entries asynchronously.
		const deletionResult = await collection.deleteMany({
			_id: {
				$in: ids
			}
		});

		// Return the deletion result as a JSON response.
		return new Response(JSON.stringify(deletionResult));
	} catch (error) {
		console.error('Error handling DELETE request:', error);
		return new Response('Internal Server Error', { status: 500 });
	}
};
