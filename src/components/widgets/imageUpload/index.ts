import ImageUpload from './ImageUpload.svelte';

import { getGuiFields } from '@src/utils/utils';
import { type Params, GuiSchema, GraphqlSchema } from './types';
// import { defaultContentLanguage } from '@src/stores/store';

// typesafe-i18n
// import { get } from 'svelte/store';
// import LL from '@src/i18n/i18n-svelte.js';

// Define the widget function
const widget = (params: Params) => {
	// Define the display function
	let display: any;

	if (!params.display) {
		display = async ({ data }) => {
			// console.log(data);

			// Return the formatted data as 200px thumbnail
			return `<img class='max-w-[200px] inline-block' src="${data?.thumbnail.url}" />`;
		};
		display.default = true;
	} else {
		display = params.display;
	}

	// Define the widget object
	const widget: { type: typeof ImageUpload; key: 'ImageUpload'; GuiFields: ReturnType<typeof getGuiFields> } = {
		type: ImageUpload,
		key: 'ImageUpload',
		GuiFields: getGuiFields(params, GuiSchema)
	};

	// Define the field object
	const field = {
		display,
		label: params.label,
		db_fieldName: params.db_fieldName,
		path: params.path || 'unique'
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
