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
	placeholder?: string;
	count?: number;
	minlength?: number;
	maxlength?: number;
	pattern?: string;
	size?: number;
	required?: boolean;
	readonly?: boolean;
	width?: string;
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
	placeholder: { type: String, required: false },
	count: { widget: Input, required: false },
	minlength: { widget: Input, required: false },
	maxlength: { widget: Input, required: false },
	pattern: { widget: Input, required: false },
	size: { widget: Input, required: false },
	required: { widget: Toggles, required: false },
	readonly: { widget: Toggles, required: false },
	width: { widget: Input, required: false }
};
