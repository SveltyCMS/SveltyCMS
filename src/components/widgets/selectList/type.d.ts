import type { Display } from '../types';

export type SelectList_Field = {
	widget: () => {};
	schema: { [Key: string]: any };
	db_fieldName: string;
	label: string | undefined;
	icon: string | undefined;
	placeholder: string | undefined;
	required: boolean | undefined;
	localization: boolean | undefined;
	options: boolean | undefined;
	width: string;
	display: Display;
};
export type SelectList_Params = {
	// Defines type of collections
	db_fieldName: string;
	label?: string;
	icon?: string;
	placeholder?: string;
	required?: boolean;
	localization?: boolean;
	options?: string;
	width?: string;
	display?: Display;
};
