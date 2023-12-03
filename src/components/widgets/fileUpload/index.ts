import FileUpload from './FileUpload.svelte';

import { getGuiFields } from '@src/utils/utils';
import { type Params, GuiSchema, GraphqlSchema } from './types';
// import { defaultContentLanguage } from '@src/stores/store';

//ParaglideJS
import * as m from '@src/paraglide/messages';

// Define the widget function
const widget = (params: Params) => {
	// Define the display function
	let display: any;

	if (!params.display) {
		display = async ({ data }) => {
			//console.log(data);

			// Return the formatted doctype as Icon
			if (data?.fileExtension) {
				const fileExt = data.fileExtension;
				let icon;
				if (fileExt === '.docx') {
					icon = 'vscode-icons:file-type-word';
				} else if (fileExt === '.xlsx') {
					icon = 'vscode-icons:file-type-excel';
				} else if (fileExt === '.pptx') {
					icon = 'vscode-icons:file-type-powerpoint';
				} else if (fileExt === '.pdf') {
					icon = 'vscode-icons:file-type-pdf2';
				}

				if (icon) {
					return `<iconify-icon icon="${icon}" width="30" />`;
				}
			}

			return m.widgets_nodata();
		};
		display.default = true;
	}

	// Define the widget object
	const widget: { type: typeof FileUpload; key: 'FileUpload'; GuiFields: ReturnType<typeof getGuiFields> } = {
		type: FileUpload,
		key: 'FileUpload',
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

		// extras
		path: params.path
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
