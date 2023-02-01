import type { Schema } from '../../../collections/types';
import type { Display } from '../types';

export type MegaMenu_Params = {
	// Defines type of collections
	db_fieldName: string;
	label?: string;
	menu: object;
	required?: boolean;
	localization?: boolean;
	display?: Display;
};

export type MegaMenu_Field = {
	widget: () => {};
	schema: { [Key: string]: any };
	db_fieldName: string;
	label?: string;
	menu: object;
	strict: boolean;
	required: boolean | undefined;
	localization: boolean | undefined;
	display: Display;
};
