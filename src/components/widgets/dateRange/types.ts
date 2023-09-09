import Input from '@src/components/system/inputs/Input2.svelte';
import Toggles from '@src/components/system/inputs/Toggles.svelte';

export type Params = {
	// default required parameters
	label: string;
	display?: DISPLAY;
	db_fieldName?: string;
	widget?: any;
	schema?: any;
	translated?: boolean;
	icon?: string;

	// Widget Specific parameters
	required?: boolean;
};

export const GuiSchema = {
	label: { widget: Input, required: true },
	display: { widget: Input, required: true },
	db_fieldName: { widget: Input, required: true },
	// widget?: any;
	// schema?: any;
	translated: { widget: Toggles, required: false },
	icon: { widget: Input, required: false },

	// Widget Specific parameters
	required: { widget: Toggles, required: false }
};
