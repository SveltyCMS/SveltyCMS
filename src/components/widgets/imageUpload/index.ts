import ImageUpload from './ImageUpload.svelte';

import { type Params, GuiSchema, GraphqlSchema } from './types';

const widget = ({
	// Accept parameters from collection
	label,
	db_fieldName,
	display,
	// extras
	icon,
	required,
	path = 'unique'
}: Params) => {
	if (!display) {
		display = async ({ data }) => {
			return `<img class='max-w-[200px]  max-h-[150px] inline-block' src="${data?.thumbnail.url}" />`;
		};
		display.default = true;
	}

	const widget: { type: any; key: 'ImageUpload' } = { type: ImageUpload, key: 'ImageUpload' };

	const field = {
		label,
		db_fieldName,
		display,
		// Widget Specific parameters
		icon,
		required,
		path
	};

	return { ...field, widget };
};

widget.GuiSchema = GuiSchema;
widget.GraphqlSchema = GraphqlSchema;

export interface FieldType extends ReturnType<typeof widget> {}
export default widget;
