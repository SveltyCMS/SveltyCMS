import type { Display } from '../types';

export type PhoneNumber_Field = {
	widget: () => {};
	schema: { [Key: string]: any };
	db_fieldName: string;
	label: string;
	icon: string | undefined;
	placeholder: string | undefined;
	required: boolean | undefined;
	display: Display;
};
export type PhoneNumber_Params = {
	db_fieldName: string;
	label?: string;
	icon?: string;
	placeholder?: string;
	required?: boolean;
	display?: Display;
};
