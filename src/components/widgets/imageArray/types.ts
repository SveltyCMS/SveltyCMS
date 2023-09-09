import ImageUpload from '@src/components/widgets/imageUpload';
type Widgets = [ReturnType<typeof ImageUpload>, ...any];

import Input from '@src/components/system/inputs/Input2.svelte';
import Toggles from '@src/components/system/inputs/Toggles.svelte';

export type Params = {
	label: string;
	display?: DISPLAY;
	db_fieldName?: string;
	widget?: any;
	schema?: any;
	icon?: string;

	// Widget Specific parameters
	imageUploadTitle: string;
	fields: Widgets;
	required?: boolean;
};

export const GuiSchema = {
	label: { widget: Input, required: true },
	display: { widget: Input, required: true },
	db_fieldName: { widget: Input, required: true },
	// widget?: any;
	// schema?: any;
	// translated: { widget: Toggles, required: false },
	icon: { widget: Input, required: false },

	// Widget Specific parameters
	imageUploadTitle: { widget: Input, required: false },
	required: { widget: Toggles, required: false }
};
