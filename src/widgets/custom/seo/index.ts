/**
@file src/widgets/seo/index.ts
@description - seo index file.
*/

import { publicEnv } from '@root/config/public';
import { getFieldName, getGuiFields } from '@utils/utils';
import { type Params, GuiSchema, GraphqlSchema } from './types';

//ParaglideJS
import * as m from '@src/paraglide/messages';

const WIDGET_NAME = 'Seo' as const;

/**
 * Defines Seo widget Parameters
 */
const widget = (params: Params & { widgetId?: string }) => {
	// Define the display function
	let display: any;

	if (!params.display) {
		display = async ({ data, contentLanguage }) => {
			// console.log(data);
			data = data ? data : {}; // Ensure data is not undefined
			// Return the data for the default content language or a message indicating no data entry
			return params.translated ? data[contentLanguage] || m.widgets_nodata() : data[publicEnv.DEFAULT_CONTENT_LANGUAGE] || m.widgets_nodata();
		};
		display.default = true;
	}

	// Define the widget object
	const widget = {
		widgetId: params.widgetId,
		Name: WIDGET_NAME,
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

		// permissions
		permissions: params.permissions

		// widget specific
	};

	// Return the field and widget objects
	return { ...field, widget };
};

// Assign Name, GuiSchema and GraphqlSchema to the widget function
widget.Name = WIDGET_NAME;
widget.GuiSchema = GuiSchema;
widget.GraphqlSchema = GraphqlSchema;
widget.toString = () => '';

// Widget icon and helper text
widget.Icon = 'tabler:seo';
widget.Description = m.widget_seo_description();

// Widget Aggregations:
widget.aggregations = {
	filters: async (info) => {
		const field = info.field as ReturnType<typeof widget>;
		return [
			{
				$match: {
					[`${getFieldName(field)}.${info.contentLanguage}`]: { $regex: info.filter, $options: 'i' }
				}
			}
		];
	},
	sorts: async (info) => {
		const field = info.field as ReturnType<typeof widget>;
		const fieldName = getFieldName(field);
		return [{ $sort: { [`${fieldName}.${info.contentLanguage}`]: info.sort } }];
	}
} as Aggregations;

// Export FieldType type and widget function
export type FieldType = ReturnType<typeof widget>;
export default widget;
