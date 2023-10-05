import FileUpload from './FileUpload.svelte';

import { type Params, GuiSchema } from './types';
import { defaultContentLanguage } from '@src/stores/store';

const widget = ({
	// Accept parameters from collection
	label,
	db_fieldName,
	display,
	icon,
	translated = false,

	// extras
	required,
	path = 'unique'
}: Params) => {
	if (!display) {
		display = async ({ data }) => {
			return `<img class='max-w-[200px]  max-h-[150px] inline-block' src="${data?.thumbnail.url}" />`;
		};
		display.default = true;
	}

	const widget: { type: any; key: 'FileUpload' } = { type: FileUpload, key: 'FileUpload' };

	const field = {
		// standard
		label,
		db_fieldName,
		display,
		icon,
		translated,
		
		// extras
		required,
		path
	};

	return { ...field, widget };
};

widget.GuiSchema = GuiSchema;

export interface FieldType extends ReturnType<typeof widget> {}
export default widget;
