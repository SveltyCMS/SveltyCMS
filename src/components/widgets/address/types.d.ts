import type { Display } from '../types';

export type Address_Field = {
	widget: () => {};
	schema: { [Key: string]: any };
	db_fieldName: string;
	label: string;
	icon: string | undefined;
	required: boolean | undefined;
	display: Display;
};
export type Address_Params = {
	// Defines type of collections
	db_fieldName: string;
	label?: string;
	icon?: string;
	required?: boolean;
	display?: Display;
};
