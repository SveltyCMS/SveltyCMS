import type { Display } from '../types';

export type Url_Field = {
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
export type Url_Params = {
	db_fieldName: string;
	label?: string;
	icon?: string;
	placeholder?: string;
	required?: boolean;
	localization?: boolean;
	display?: Display;
};
