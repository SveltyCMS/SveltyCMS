// MegaMenu - allows multilevel menus for navigation
import MegaMenu from './MegaMenu.svelte';
import Text from '../text';
import widgets from '..';

// Auth
import type { User } from '@src/auth/types';

// Stores
import { writable, type Writable } from 'svelte/store';
import { entryData, mode, headerActionButton2 } from '@src/stores/store';

import { getFieldName, getGuiFields } from '@src/utils/utils';
import { type Params, GuiSchema, GraphqlSchema } from './types';

export const currentChild: Writable<any> = writable({});

//ParaglideJS
import * as m from '@src/paraglide/messages';

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
	const widget: { type: typeof MegaMenu; key: 'MegaMenu'; GuiFields: ReturnType<typeof getGuiFields> } = {
		type: MegaMenu,
		key: 'MegaMenu',
		GuiFields: getGuiFields(params, GuiSchema)
	};

	for (const level of params.fields) {
		level.unshift(Text({ label: 'Header', translated: true }));
	}

	params.fields.unshift([Text({ label: 'Header', translated: true })]);

	const callback = ({ data }) => {
		entryData.set(data?.entryList[0]);
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
		icon: params.icon,
		width: params.width,
		helper: params.helper,

		// permissions
		permissions: params.permissions,

		// extras
		fields: params.fields,
		callback
	};

	// Return the field and widget objects
	return { ...field, widget };
};

// Assign GuiSchema and GraphqlSchema to the widget function
widget.GuiSchema = GuiSchema;
widget.GraphqlSchema = GraphqlSchema;

// Cleans the children of a megamenu by removing any fields that the user does not have permission to read.
widget.modifyRequest = async ({ field, data, user }: { field: ReturnType<typeof widget>; data: { [key: string]: any }; user: User }) => {
	const cleanChildren = async (children, level = 1) => {
		for (const index in children) {
			for (const _field of field.fields[level]) {
				if (_field?.permissions?.[user.role].read == false) {
					delete children[index][getFieldName(_field)];
				} else {
					const widget = widgets[_field.widget.key];
					if ('modifyRequest' in widget) {
						children[index][getFieldName(_field)] = await widget.modifyRequest({
							field: _field,
							data: children[index][getFieldName(_field)],
							user,
							type: 'GET'
						});
					}
				}
			}

			children[index].children.length > 0 && field.fields[level + 1]?.length > 0 && (await cleanChildren(children[index].children, level + 1));
		}
	};

	await cleanChildren(data.children);

	return data;
};

// Widget icon and helper text
widget.Icon = 'lucide:menu-square';
widget.Description = m.widget_megaMenu_description();

// Widget Aggregations:
widget.aggregations = {
	filters: async (info) => {
		const field = info.field as ReturnType<typeof widget>;

		return [{ $match: { [`${getFieldName(field)}.Header.${info.contentLanguage}`]: { $regex: info.filter, $options: 'i' } } }];
	},
	sorts: async (info) => {
		const field = info.field as ReturnType<typeof widget>;
		const fieldName = getFieldName(field);
		return [{ $sort: { [`${fieldName}.Header.${info.contentLanguage}`]: info.sort } }];
	}
} as Aggregations;

// Export FieldType interface and widget function
export interface FieldType extends ReturnType<typeof widget> {}
export default widget;
