import type { Display } from '../types';

export type Email_Field = {
	widget: () => {};
	schema: { [Key: string]: any };
	db_fieldName: string;
	label: string;
	icon: string | undefined;
	placeholder: string | undefined;
	required: boolean | undefined;
	localization: boolean | undefined;
	display: Display;
};
export type Email_Params = {
	// Defines type of collections
	db_fieldName: string;
	label?: string;
	icon?: string;
	placeholder?: string;
	required?: boolean;
	localization?: boolean;
	display?: Display;
};
