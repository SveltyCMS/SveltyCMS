/**
@file src/widgets/core/megaMenu/index.ts
@description - MegaMenu index file.
*/

import { getFieldName, getGuiFields } from '@utils/utils';
import { GraphqlSchema, GuiSchema, type Fields, type Params } from './types';

import { getWidget } from '@widgets/registry';
import type { ModifyRequestParams } from '@widgets/types';
import Input from '../input';

// Stores
import { collectionValue, mode } from '@stores/collectionStore.svelte';
import { headerActionButton2 } from '@stores/store.svelte';
import { writable, type Writable } from 'svelte/store';

//ParaglideJS
import * as m from '@src/paraglide/messages';

// Types
import type { Field } from '@src/content/types';

// Extended field interface for MegaMenu
interface MegaMenuField extends Field {
	fields: Fields;
}

const WIDGET_NAME = 'MegaMenu' as const;

interface CurrentChild {
	_id: string;
	[key: string]: unknown;
}

export const currentChild: Writable<CurrentChild> = writable({
	_id: ''
} as CurrentChild);

/**
 * Defines MegaMenu widget Parameters
 */
const widget = (params: Params & { widgetId?: string }) => {
	// Define the display function
	interface DisplayParams {
		data: {
			Header: Record<string, string>;
		};
		contentLanguage: string;
	}

	// Define the display function
	let display: (params: DisplayParams) => Promise<string> | string;

	if (!params.display) {
		display = async ({ data, contentLanguage }: DisplayParams) => {
			// Return the data for the default content language
			return data.Header[contentLanguage];
		};
		// Add default property to the function
		(display as any).default = true;
	} else {
		// Cast the display function to match expected signature
		display = params.display as (params: DisplayParams) => Promise<string> | string;
	}

	// Define the widget object
	const widget = {
		widgetId: params.widgetId,
		Name: WIDGET_NAME,
		GuiFields: getGuiFields(params, GuiSchema),
		componentPath: '/src/widgets/core/megaMenu/MegaMenu.svelte'
	};

	// Initialize fields if not provided
	if (!Array.isArray(params.fields)) {
		params.fields = [];
	}

	// Add header fields if fields array is empty
	if (params.fields.length === 0) {
		params.fields.push([Input({ label: 'Header', translated: true })]);
	}

	// Add header to each level
	for (const level of params.fields) {
		if (Array.isArray(level)) {
			level.unshift(Input({ label: 'Header', translated: true }));
		}
	}

	// Define the field object
	const field = {
		widget: widget,
		type: WIDGET_NAME,
		config: params,
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
		// Add callback method
		callback: ({ data }: { data: unknown }) => {
			// Implementation: Set collection value and mode when data is received
			collectionValue.set((data as any)?.entryList?.[0] || {});
			mode.set('edit');
			headerActionButton2.set('fa:refresh');
		}
	}; // Return the field and widget objects, cast to include MegaMenuField
	return { ...field, widget } as unknown as MegaMenuField;
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
widget.modifyRequest = async ({ collection, field, data, user, type, id }: ModifyRequestParams) => {
	const _data = data.get();
	// Cast field to MegaMenuField to access the fields property
	const megaMenuField = field as unknown as MegaMenuField;

	interface MenuItem {
		_id: string;
		children: MenuItem[];
		[key: string]: unknown;
	}

	let old_data: Array<MenuItem>;
	const process_OldData = (children: MenuItem[], level = 1, result: MenuItem[] = []) => {
		for (const index in children) {
			for (const _field of megaMenuField.fields[level]) {
				if (_field?.permissions?.[user.role].write == false) {
					result.push(children[index]);
				}
			}
			if (children[index].children.length > 0 && megaMenuField.fields[level + 1]?.length > 0) {
				process_OldData(children[index].children, level + 1, result);
			}
		}
		return result;
	};
	const cleanChildren = async (children: Record<string, unknown>[], level = 1) => {
		for (const index in children) {
			for (const _field of megaMenuField.fields[level]) {
				if (_field?.permissions?.[user.role].write == false && type == 'PATCH') {
					// if req type is patch get old data and rewrite "write false" field
					if (!old_data) {
						const res = await collection.findOne({ _id: id });
						old_data = process_OldData(res[getFieldName(field as any)].children);
					}
					const i = old_data.findIndex((item) => item._id == children[index]._id);
					children[index][getFieldName(_field as any)] = old_data.splice(i, 1)[0][getFieldName(_field as any)];
				} else if (
					// if read or write is false remove field from body
					(type == 'GET' && _field?.permissions?.[user.role].read == false) ||
					(['POST', 'PATCH'].includes(type) && _field?.permissions?.[user.role].write == false)
				) {
					delete children[index][getFieldName(_field as any)];
				} else {
					// if menu as other nested widgets inside which has its own modifyRequest method...
					const widgetInstance = getWidget(_field.widget.Name);
					if (widgetInstance && 'modifyRequest' in widgetInstance && widgetInstance.modifyRequest) {
						const data = {
							get() {
								return children[index][getFieldName(_field as any)];
							},
							update(newData: unknown) {
								children[index][getFieldName(_field as any)] = newData;
							}
						};
						await widgetInstance.modifyRequest({
							collection,
							field: _field,
							data,
							user,
							type,
							id
						});
					}
				}
			}

			if (children[index].children.length > 0 && megaMenuField.fields[level + 1]?.length > 0) {
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
		const field = info.field as unknown as MegaMenuField;

		return [
			{
				$match: {
					[`${getFieldName(field as any)}.Header.${info.contentLanguage}`]: {
						$regex: info.filter,
						$options: 'i'
					}
				}
			}
		];
	},
	sorts: async (info) => {
		const field = info.field as unknown as MegaMenuField;
		const fieldName = getFieldName(field as any);
		return [{ $sort: { [`${fieldName}.Header.${info.contentLanguage}`]: info.sort } }];
	}
} as Aggregations;

// Export FieldType type and widget function
export type FieldType = ReturnType<typeof widget>;
export default widget;
