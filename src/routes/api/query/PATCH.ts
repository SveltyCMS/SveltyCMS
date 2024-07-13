import { dbAdapter, getCollectionModels } from '@api/databases/db';
import { modifyRequest } from './modifyRequest';

import type { User } from '@src/auth/types';
import type { Schema } from '@src/collections/types';

// Import logger
import logger from '@utils/logger';

// Function to handle PATCH requests for a specified collection
export const _PATCH = async ({ data, schema, user }: { data: FormData; schema: Schema; user: User }) => {
	try {
		logger.debug(`PATCH request received for schema: ${schema.name}, user_id: ${user.user_id}`);

		if (!dbAdapter) {
			logger.error('Database adapter is not initialized.');
			return new Response('Internal server error: Database adapter not initialized', { status: 500 });
		}

		const body: { [key: string]: any } = {};
		const collections = await getCollectionModels(); // Get collection models from the database
		logger.debug(`Collection models retrieved: ${Object.keys(collections).join(', ')}`);

		let collection = collections[schema.name as string]; // Get the specific collection based on the schema name
		const _id = data.get('_id') as string; // Get the document ID from the form data
		const fileIDS: string[] = [];

		// Check if the collection exists
		if (!collection) {
			logger.error(`Collection not found for schema: ${schema.name}`);
			return new Response('Collection not found!', { status: 404 });
		}

		// Parse the form data and build the body object
		for (const key of data.keys()) {
			try {
				body[key] = JSON.parse(data.get(key) as string, (key, value) => {
					if (value?.instanceof === 'File') {
						const file = data.get(value.id) as File;
						fileIDS.push(value.id);
						return file;
					}
					return value;
				});
			} catch (e) {
				body[key] = data.get(key) as string;
			}
		}
		logger.debug(`Form data parsed: ${JSON.stringify(body)}`);

		// If the request is linked to another collection
		if (body._is_link) {
			collection = collections[body._linked_collection as string];
		}

		// Handle removal of files
		for (const id of fileIDS) {
			delete body[id];
		}

		// Handle removal of storage images
		if (body?._meta_data?.storage_images?.removed) {
			await dbAdapter.updateMany('_storage_images', { _id: { $in: body._meta_data.storage_images.removed } }, { $pull: { used_by: _id } });
		}
		body._id = _id;
		logger.debug(`Document prepared for update: ${JSON.stringify(body)}`);

		// Modify request with the updated body
		await modifyRequest({ data: [body], fields: schema.fields, collection, user, type: 'PATCH' });
		logger.debug(`Request modified: ${JSON.stringify(body)}`);

		// Handle links if any
		let links: { [key: string]: any } = {};
		if (schema.links?.length || 0 > 0 || body._is_link) {
			const doc = await dbAdapter.findOne(schema.name, { _id: body._id });
			links = doc?._links || {};
		}

		for (const _collection in body._links) {
			const linkedCollection = collections[_collection as string];
			if (!linkedCollection) continue;

			if (!body._links[_collection] && links[_collection]) {
				delete body._links[_collection];
				await dbAdapter.updateMany(
					_collection,
					{
						_link_id: body._id,
						_linked_collection: body._is_link ? body._linked_collection : schema.name
					},
					{ $unset: { used_by: '' } }
				);
			} else if (!body._links[_collection]) continue;

			if (links[_collection]) continue;

			const newLinkId = dbAdapter.generateId();
			await dbAdapter.insertMany(_collection, [
				{
					_id: newLinkId,
					_link_id: body._id,
					_linked_collection: body._is_link ? body._linked_collection : schema.name
				}
			]);
			body._links[_collection] = newLinkId;
		}

		// Clean up body
		delete body._is_link;
		delete body._linked_collection;

		// Update the document in the collection
		const result = await dbAdapter.updateOne(schema.name, { _id }, { $set: body });
		logger.debug(`Document updated: ${JSON.stringify(result)}`);

		// Return the result as a JSON response
		return new Response(JSON.stringify(result));
	} catch (error) {
		// Handle error by checking its type
		const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
		logger.error(`Error occurred during PATCH request: ${errorMessage}`);
		return new Response(errorMessage, { status: 500 });
	}
};
