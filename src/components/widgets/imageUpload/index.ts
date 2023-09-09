import ImageUpload from './ImageUpload.svelte';

import { type Params, GuiSchema } from './types';
import { defaultContentLanguage } from '@src/stores/store';

// import { Avatar } from '@skeletonlabs/skeleton';
// Avatar <Avatar src="${data?.thumbnail.url} " width="w-32" rounded="rounded"/>

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
		schema: {
			[db_fieldName || label]: { size: Number, name: String, type: String, lastModified: Number }
		},

		// Widget Specific parameters
		icon,
		required,
		path
	};

	return { ...field, widget };
};

widget.GuiSchema = GuiSchema;

export interface FieldType extends ReturnType<typeof widget> {}
export default widget;
