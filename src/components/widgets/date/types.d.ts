import type { Display } from '../types';

export type Date_Field = {
	widget: () => {};
	schema: { [Key: string]: any };
	db_fieldName: string;
	label: string;
	icon: string | undefined;
	required: boolean | undefined;
	display: Display;
};
export type Date_Params = {
	// Defines type of collections
	db_fieldName: string;
	label?: string;
	icon?: string;
	required?: boolean;
	localization?: boolean;
	display?: Display;
};
