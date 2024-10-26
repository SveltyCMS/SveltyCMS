/**
 * @file src/routes/api/query/GET.ts
 * @description Handler for GET operations on collections.
 */
import type { Schema } from '@src/collections/types';
import widgets from '@components/widgets';
import { getFieldName, get_elements_by_id } from '@utils/utils';
import { dbAdapter, getCollectionModels } from '@src/databases/db';
import type { User } from '@src/auth/types';
import { publicEnv } from '@root/config/public';
import { modifyRequest } from './modifyRequest';
import { getCollections } from '@src/collections';

// System Logger
import { logger } from '@utils/logger';

export async function _GET({
	schema,
	sort = {},
	filter = {},
	contentLanguage = publicEnv.DEFAULT_CONTENT_LANGUAGE,
	user,
	limit = 0,
	page = 1
}: {
	schema: Schema;
	user: User;
	sort?: { [key: string]: number };
	filter?: { [key: string]: string };
	contentLanguage?: string;
	limit?: number;
	page?: number;
}) {
	try {
		let aggregations: any = [];
		let collectionModels = await getCollectionModels();
		let collections = await getCollections();

		if (!schema.name) {
			logger.error('Schema name is undefined');
			return new Response('Schema name is undefined', { status: 400 });
		}

		let collection = collectionModels[schema.name];
		if (!collection) {
			logger.error(`Collection not found for schema: ${schema.name}`);
			return new Response('Collection not found', { status: 404 });
		}

		let skip = (page - 1) * limit;

		// Build aggregations from widgets
		for (let field of schema.fields) {
			let widget = widgets[field.widget.Name];
			let fieldName = getFieldName(field);

			if ('aggregations' in widget) {
				let _filter = filter[fieldName];
				let _sort = sort[fieldName];

				if (widget.aggregations?.filters && _filter) {
					try {
						let _aggregations = await widget.aggregations.filters({
							field,
							contentLanguage: contentLanguage,
							filter: _filter
						});
						aggregations.push(..._aggregations);
					} catch (error) {
						logger.error(`Error in widget filter aggregation for field ${fieldName}: ${error}`);
					}
				}
				if (widget.aggregations?.sorts && _sort) {
					try {
						let _aggregations = await widget.aggregations.sorts({
							field,
							contentLanguage: contentLanguage,
							sort: _sort
						});
						aggregations.push(..._aggregations);
					} catch (error) {
						logger.error(`Error in widget sort aggregation for field ${fieldName}: ${error}`);
					}
				}
			}
		}

		// Execute aggregation pipeline
		let entryListWithCount = await collection.aggregate([
			{
				$facet: {
					entries: [...aggregations, { $skip: skip }, ...(limit ? [{ $limit: limit }] : [])],
					totalCount: [...aggregations, { $count: 'total' }]
				}
			}
		]);

		let entryList = entryListWithCount[0].entries;

		// Handle linked collections
		for (let index in entryList) {
			let entry = entryList[index];
			if (entry._link_id && entry._linked_collection) {
				let linkedCollection = collectionModels[collections[entry._linked_collection].name];
				let resp = await linkedCollection.findOne({ _id: entry._link_id });
				if (!resp) {
					entryList.splice(index, 1);
					continue;
				}
				entryList[index] = resp;
				entryList[index]._is_link = true;
				entryList[index]._linked_collection = entry._linked_collection;
			}
		}

		// Modify request with the retrieved entries
		await modifyRequest({
			data: entryList,
			collection,
			fields: schema.fields,
			user,
			type: 'GET'
		});

		// Get all collected IDs and modify request
		await get_elements_by_id.getAll(dbAdapter);

		// Calculate pagination
		let totalCount = entryListWithCount[0].totalCount[0] ? entryListWithCount[0].totalCount[0].total : 0;

		let pagesCount = limit > 0 ? Math.ceil(totalCount / limit) : 1;

		logger.info(`GET request completed. Total count: ${totalCount}, Pages count: ${pagesCount}`);

		// Return the response
		return new Response(
			JSON.stringify({
				entryList,
				pagesCount
			}),
			{
				headers: { 'Content-Type': 'application/json' }
			}
		);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
		logger.error(`Error in GET request: ${errorMessage}`);
		return new Response(JSON.stringify({ error: errorMessage }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
}
