import type { Display } from '../types';

export type Condition_Field = {
	widget: () => {};
	schema: { [Key: string]: any };
	db_fieldName: string;
	label: string | undefined;
	fields: any[];
	required: boolean | undefined;
	display: Display;
};
export type Condition_Params = {
	// Defines type of collections
	db_fieldName: string;
	label?: string;
	required?: boolean;
	fields: Array<any>;
	display?: Display;
};
