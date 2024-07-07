import widgets from '@src/components/widgets';
import { getFieldName } from '@src/utils/utils';
import type { User } from '@src/auth/types';
import type { Collection } from 'mongoose';

// Import logger
import logger from '@utils/logger';

// Define Field type locally if not available in @src/collections/types
interface Field {
	widget: {
		Name: string;
	};
}

// Define the parameters for the function
interface ModifyRequestParams {
	data: any[];
	fields: Field[];
	collection: Collection<any>;
	user: User;
	type: string;
}

// Function to modify request data based on field widgets
export async function modifyRequest({ data, fields, collection, user, type }: ModifyRequestParams) {
	try {
		logger.debug(`Starting modifyRequest for type: ${type}, user: ${user.user_id}, collection: ${collection.modelName}`);
		logger.debug(`Initial data: ${JSON.stringify(data)}`);

		for (const field of fields) {
			const widget = widgets[field.widget.Name];
			const fieldName = getFieldName(field);

			logger.debug(`Processing field: ${fieldName}, widget: ${field.widget.Name}`);

			if ('modifyRequest' in widget) {
				// Widget can modify its own portion of entryList
				data = await Promise.all(
					data.map(async (entry: any) => {
						const dataAccessor = {
							get() {
								return entry[fieldName];
							},
							update(newData: any) {
								entry[fieldName] = newData;
							}
						};

						logger.debug(`Modifying entry with ID: ${entry._id}, field: ${fieldName}`);

						await widget.modifyRequest({
							collection,
							field,
							data: dataAccessor,
							user,
							type,
							id: entry._id,
							meta_data: entry.meta_data
						});

						logger.debug(`Modified entry: ${JSON.stringify(entry)}`);
						return entry;
					})
				);
			}
		}
		logger.debug(`Modified data: ${JSON.stringify(data)}`);
		return data; // Return the modified data
	} catch (error) {
		// Handle error by checking its type
		logger.error('Error in modifyRequest:', error);
		const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
		throw new Error(errorMessage);
	}
}
