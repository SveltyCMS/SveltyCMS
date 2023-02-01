import type { Display } from '../types';

export type Seo_Field = {
	widget: () => {};
	schema: { [Key: string]: any };
	db_fieldName: string;
	label: string;
	icon: string | undefined;
	color: string | undefined;
	required: boolean | undefined;
	localization: boolean | undefined;
	display: Display;
};
export type Seo_Params = {
	db_fieldName: string;
	label?: string;
	icon?: string;
	color?: string;
	required?: boolean;
	localization?: boolean;
	display?: Display;
};
