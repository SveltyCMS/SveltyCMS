import type { Display } from '../types';

export type Checkbox_Field = {
	widget: () => {};
	schema: { [Key: string]: any };
	db_fieldName: string;
	label: string;
	icon: string | undefined;
	color: string | undefined;
	width: string | undefined;
	required: boolean | undefined;
	display: Display;
};
export type Checkbox_Params = {
	// Defines type of collections
	db_fieldName: string;
	label?: string;
	icon?: string;
	color?: string;
	width?: string;
	required?: boolean;
	display?: Display;
};
