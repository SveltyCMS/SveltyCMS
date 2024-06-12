import widgets from '@src/components/widgets';
import { getFieldName } from '@src/utils/utils';
import type { User } from '@src/auth/types';
import type { Collection } from 'mongoose';

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
		for (const field of fields) {
			const widget = widgets[field.widget.Name];
			const fieldName = getFieldName(field);

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
						await widget.modifyRequest({
							collection,
							field,
							data: dataAccessor,
							user,
							type,
							id: entry._id,
							meta_data: entry.meta_data
						});
						return entry;
					})
				);
			}
		}
		return data; // Return the modified data
	} catch (error) {
		// Handle error by checking its type
		if (error instanceof Error) {
			console.error('Error in modifyRequest:', error.message);
			throw new Error(error.message);
		} else {
			console.error('Unknown error in modifyRequest');
			throw new Error('Unknown error occurred');
		}
	}
}
