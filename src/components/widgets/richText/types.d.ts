import type { Display } from '../types';

export type Rich_Text = {
	widget: () => {};
	schema: { [Key: string]: any };
	db_fieldName: string;
	label: string | undefined;
	localization: boolean | undefined;
	display: Display;
};
export type Rich_Text_Params = {
	db_fieldName: string;
	label?: string;
	placeholder?: string;
	localization?: boolean;
	display?: Display;
};
