import Relation from './Relation.svelte';

import { findById, getGuiFields } from '@src/utils/utils';
import { type Params, GuiSchema, GraphqlSchema } from './types';
import { defaultContentLanguage } from '@src/stores/store';

// Define the widget function
const widget = (params: Params) => {
	// Define the display function
	let display: any;

	if (!params.display) {
		display = async ({ data, contentLanguage }) => {
			// console.log(data);
			if (typeof data == 'string') {
				data = await findById(data, params.relation);
			}
			return Object.values(data)[1]?.[contentLanguage] || Object.values(data)[1]?.[defaultContentLanguage] || Object.values(data)[1];
		};
		display.default = true;
	} else {
		display = async ({ data, collection, field, entry, contentLanguage }) => {
			if (typeof data == 'string') {
				data = await findById(data, params.relation);
			}
			return params.display?.({ data, collection, field, entry, contentLanguage });
		};
	}

	// Define the widget object
	const widget: { type: typeof Relation; key: 'Relation'; GuiFields: ReturnType<typeof getGuiFields> } = {
		type: Relation,
		key: 'Relation',
		GuiFields: getGuiFields(params, GuiSchema)
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

		// extra
		relation: params.relation
	};

	// Return the field and widget objects
	return { ...field, widget };
};

// Assign GuiSchema and GraphqlSchema to the widget function
widget.GuiSchema = GuiSchema;
widget.GraphqlSchema = GraphqlSchema;

// Export FieldType interface and widget function
export interface FieldType extends ReturnType<typeof widget> {}
export default widget;
