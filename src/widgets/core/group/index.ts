/**
@file src/widgets/core/group/index.ts
@description - Group index file.
 */

import type { Params, GuiSchema, GraphqlSchema } from './types';

//ParaglideJS
import * as m from '@src/paraglide/messages';

// Placeholder type definition for Aggregations
type Aggregations = Record<string, unknown>; // Adjust if a more specific type exists

const WIDGET_NAME = 'Group' as const;

const GuiSchema = {
	// Define your GUI schema structure here
	type: 'object',
	properties: {
		fields: {
			type: 'array'
		},
		mode: {
			type: 'string'
		}
	}
};

const GraphqlSchema = {
	// Define your GraphQL schema structure here
	type: 'Object',
	fields: {}
};

/**
 * Defines Group widget Parameters
 */

// Define a type for the display function signature
type DisplayFunctionParams = { data: unknown; contentLanguage: string }; // Using unknown instead of any
type DisplayFunction = (args: DisplayFunctionParams) => Promise<string | unknown>; // Using unknown instead of any

const widget = (params: Params) => {
	// Define the display function with a specific type
	let display: DisplayFunction;

	if (!params.display) {
		display = async ({ data, contentLanguage }: DisplayFunctionParams) => {
			// console.log(data);
			const dataObj = data && typeof data === 'object' ? data : {}; // Ensure data is an object-like structure
			// Return the data for the default content language or a message indicating no data entry
			// Need type assertion or check for dataObj properties
			return params.translated
				? (dataObj as Record<string, unknown>)[contentLanguage] || m.widgets_nodata()
				: (dataObj as Record<string, unknown>)[publicEnv.DEFAULT_CONTENT_LANGUAGE] || m.widgets_nodata();
		};
		display.default = true;
	} else {
		display = params.display;
	}

	// Define the widget object
	const widget = {
		Name: WIDGET_NAME
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
		mode: params.mode
	};

	// Return the field and widget objects
	return { ...field, widget };
};

// Assign GuiSchema and GraphqlSchema to the widget function
widget.Name = WIDGET_NAME;
widget.GuiSchema = GuiSchema;
widget.GraphqlSchema = GraphqlSchema;
widget.toString = () => '';

// Widget icon and helper text
widget.Icon = 'material-symbols:category';
widget.Description = 'This widget is used to group other widgets together.';

// Widget Aggregations:
widget.aggregations = {} as Aggregations;

// Export FieldType type and widget function
export type FieldType = ReturnType<typeof widget>;
export default widget;
