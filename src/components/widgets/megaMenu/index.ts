/**
@file src/components/widgets/megaMenu/index.ts
@description - MegaMenu index file.
*/

import { getFieldName, getGuiFields } from '@utils/utils';
import { type Params, GuiSchema, GraphqlSchema } from './types';

import widgets, { type ModifyRequestParams } from '..';
import Input from '../input';

// Stores
import { writable, type Writable } from 'svelte/store';
import { headerActionButton2 } from '@stores/store';
import { collectionValue, mode } from '@root/src/stores/collectionStore.svelte';

//ParaglideJS
import * as m from '@src/paraglide/messages';

const WIDGET_NAME = 'MegaMenu' as const;

export const currentChild: Writable<any> = writable({});

/**
 * Defines MegaMenu widget Parameters
 */
const widget = (params: Params) => {
	// Define the display function
	let display: any;

	if (!params.display) {
		display = async ({ data, contentLanguage }) => {
			// Return the data for the default content language
			return data.Header[contentLanguage];
		};
		display.default = true;
	} else {
		display = params.display;
	}

	// Define the widget object
	const widget = {
		Name: WIDGET_NAME,
		GuiFields: getGuiFields(params, GuiSchema)
	};

	// Add the header
	for (const level of params.fields) {
		level.unshift(Input({ label: 'Header', translated: true }));
	}

	// Add the header
	params.fields.unshift([Input({ label: 'Header', translated: true })]);

	// Define the callback
	const callback = ({ data }) => {
		collectionValue.set(data?.entryList[0]);
		mode.set('edit');
		headerActionButton2.set('fa:refresh');
	};

	// Define the field object
	const field = {
		// default fields
		display,
		label: params.label,
		db_fieldName: params.db_fieldName,
		translated: params.translated,
		required: params.required,
		icon: params.icon,
		width: params.width,
		helper: params.helper,

		// permissions
		permissions: params.permissions,

		// widget specific
		fields: params.fields,
		callback
	};

	// Return the field and widget objects
	return { ...field, widget };
};

// Assign Name, GuiSchema and GraphqlSchema to the widget function
widget.Name = WIDGET_NAME;
widget.GuiSchema = GuiSchema;
widget.GraphqlSchema = GraphqlSchema;
widget.toString = () => '';

// Widget icon and helper Input
widget.Icon = 'lucide:menu-square';
widget.Description = m.widget_megaMenu_description();

// Cleans the children of a megamenu by removing any fields that the user does not have permission to read.
widget.modifyRequest = async ({ collection, field, data, user, type, id }: ModifyRequestParams<typeof widget>) => {
	const _data = data.get();
	let old_data: Array<any>;
	const process_OldData = (children, level = 1, result = []) => {
		for (const index in children) {
			for (const _field of field.fields[level]) {
				if (_field?.permissions?.[user.role].write == false) {
					(result as Array<any>).push(children[index]);
				}
			}
			if (children[index].children.length > 0 && field.fields[level + 1]?.length > 0) {
				process_OldData(children[index].children, level + 1, result);
			}
		}
		return result;
	};
	const cleanChildren = async (children, level = 1) => {
		for (const index in children) {
			for (const _field of field.fields[level]) {
				if (_field?.permissions?.[user.role].write == false && type == 'PATCH') {
					// if req type is patch get old data and rewrite "write false" field
					if (!old_data) {
						const res = await collection.findOne({ _id: id });
						old_data = process_OldData(res[getFieldName(field)].children);
					}
					const i = old_data.findIndex((item) => item._id == children[index]._id);
					children[index][getFieldName(_field)] = old_data.splice(i, 1)[0][getFieldName(_field)];
				} else if (
					// if read or write is false remove field from body
					(type == 'GET' && _field?.permissions?.[user.role].read == false) ||
					(['POST', 'PATCH'].includes(type) && _field?.permissions?.[user.role].write == false)
				) {
					delete children[index][getFieldName(_field)];
				} else {
					// if menu as other nested widgets inside which has its own modifyRequest method...
					const widget = widgets[_field.widget.Name];
					if ('modifyRequest' in widget) {
						const data = {
							get() {
								return children[index][getFieldName(_field)];
							},
							update(newData) {
								children[index][getFieldName(_field)] = newData;
							}
						};
						if ('modifyRequest' in widget) {
							await widget.modifyRequest({
								collection,
								field: _field as ReturnType<typeof widget>,
								data,
								user,
								type,
								id
							});
						}
					}
				}
			}

			if (children[index].children.length > 0 && field.fields[level + 1]?.length > 0) {
				await cleanChildren(children[index].children, level + 1);
			}
		}
	};

	await cleanChildren(_data.children);

	return _data;
};

// Widget Aggregations:
widget.aggregations = {
	filters: async (info) => {
		const field = info.field as ReturnType<typeof widget>;

		return [
			{
				$match: {
					[`${getFieldName(field)}.Header.${info.contentLanguage}`]: {
						$regex: info.filter,
						$options: 'i'
					}
				}
			}
		];
	},
	sorts: async (info) => {
		const field = info.field as ReturnType<typeof widget>;
		const fieldName = getFieldName(field);
		return [{ $sort: { [`${fieldName}.Header.${info.contentLanguage}`]: info.sort } }];
	}
} as Aggregations;

// Export FieldType type and widget function
export type FieldType = ReturnType<typeof widget>;
export default widget;

