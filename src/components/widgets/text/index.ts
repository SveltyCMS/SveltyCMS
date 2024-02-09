import Text from './Text.svelte';

// Stores
import { defaultContentLanguage } from '@stores/store';

//ParaglideJS
import * as m from '@src/paraglide/messages';

import { getFieldName, getGuiFields } from '@src/utils/utils';
import { type Params, GuiSchema, GraphqlSchema } from './types';

/**
 * Defines Text widget Parameters
 */
const widget = (params: Params) => {
	// Define the display function
	let display: any;

	if (!params.display) {
		display = async ({ data, contentLanguage }) => {
			// console.log(data);
			data = data ? data : {}; // Ensure data is not undefined
			// Return the data for the default content language or a message indicating no data entry
			return params.translated ? data[contentLanguage] || m.widgets_nodata() : data[defaultContentLanguage] || m.widgets_nodata();
		};
		display.default = true;
	}

	// Define the widget object
	const widget: { type: typeof Text; key: 'Text'; GuiFields: ReturnType<typeof getGuiFields> } = {
		type: Text,
		key: 'Text',
		GuiFields: getGuiFields(params, GuiSchema)
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

		//extra
		placeholder: params.placeholder,
		count: params.count,
		minlength: params.minlength,
		maxlength: params.maxlength,
		prefix: params.prefix,
		suffix: params.suffix,
		readonly: params.readonly,
		disabled: params.disabled
	};

	// Return the field and widget objects
	return { ...field, widget };
};

// Assign GuiSchema and GraphqlSchema to the widget function
widget.GuiSchema = GuiSchema;
widget.GraphqlSchema = GraphqlSchema;

// widget icon and helper text
widget.Icon = 'icon-park-outline:text';
widget.Description = m.widget_text_description();

// Widget Aggregations:
widget.aggregations = {
	filters: async (info) => {
		const field = info.field as ReturnType<typeof widget>;
		return [{ $match: { [`${getFieldName(field)}.${info.contentLanguage}`]: { $regex: info.filter, $options: 'i' } } }];
	},
	sorts: async (info) => {
		const field = info.field as ReturnType<typeof widget>;
		const fieldName = getFieldName(field);
		return [{ $sort: { [`${fieldName}.${info.contentLanguage}`]: info.sort } }];
	}
} as Aggregations;

// Export FieldType interface and widget function
export interface FieldType extends ReturnType<typeof widget> {}
export default widget;
