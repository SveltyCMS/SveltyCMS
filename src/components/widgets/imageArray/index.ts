// ImageArray - allows multiple image upload with editor
import ImageArray from './ImageArray.svelte';
import ImageUpload from '../imageUpload';

import { getFieldName, getGuiFields } from '@src/utils/utils.js';
import type { Params as ImageUpload_Params } from '../imageUpload/types';
import { type Params, GuiSchema, GraphqlSchema } from './types';

// Define the widget function
const widget = (params: Params) => {
	params.fields.unshift(
		ImageUpload({
			db_fieldName: params.uploader_db_fieldName,
			label: params.uploader_label,
			display: params.uploader_display,
			path: params.uploader_path
		})
	);

	const uploader = params.fields[0] as ImageUpload_Params;

	// Define the display function
	let display: any;

	if (!params.display) {
		display = async ({ data, collection, field, entry, contentLanguage }) => {
			return `<img class='max-w-[200px] inline-block' src="${entry[getFieldName(uploader)]?.thumbnail?.url}" />`;
		};
		display.default = true;
	} else {
		display = params.display;
	}

	// Define the widget object
	const widget: { type: typeof ImageArray; key: 'ImageArray'; GuiFields: ReturnType<typeof getGuiFields> } = {
		type: ImageArray,
		key: 'ImageArray' as const,
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

		// extra fields
		upload: true,
		fields: params.fields,
		uploader_label: params.uploader_label,
		uploader_path: params.uploader_path,
		uploader_display: params.uploader_display,
		uploader_db_fieldName: params.uploader_db_fieldName,
		extract: true
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
