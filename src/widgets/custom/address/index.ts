/**
@file src/widgets/custom/address/index.ts
@description - Address index file.
*/

import { publicEnv } from '@root/config/public';
import { getFieldName, getGuiFields } from '@utils/utils';
import { GuiSchema, GraphqlSchema, type Params } from './types';

//ParaglideJS
import * as m from '@src/paraglide/messages';

const WIDGET_NAME = 'Address' as const;

// Import DISPLAY type from app.d.ts
type DISPLAY = (({ data: any, collection: any, field: any, entry: any, contentLanguage: string }) => Promise<any>) & { default?: boolean };

/**
 * Defines the Address widget Parameters
 */
const widget = (params: Params & { widgetId?: string }) => {
	// Define the display function
	let display: DISPLAY;

	if (!params.display) {
		display = async ({ data }) => {
			data = data ? data : {}; // Ensure data is not undefined
			// Return the data for the default content language or a message indicating no data entry
			return data[publicEnv.DEFAULT_CONTENT_LANGUAGE] || m.widgets_nodata();
		};
		display.default = true;
	} else {
		display = params.display;
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
		permissions: params.permissions,

		// widget specific
		mapCenter: params.mapCenter || { lat: 51.34, lng: 6.57 }, // Default to Krefeld, Germany
		zoom: params.zoom || 12,
		defaultCountry: params.defaultCountry || 'Germany',
		hiddenFields: params.hiddenFields || []
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
widget.Icon = 'mdi:home-map-marker';
widget.Description = 'description';

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
