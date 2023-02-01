import type { Schema } from '../../../collections/types';
import type { Display } from '../types';

export type Relation_Params = {
	// Defines type of collections
	db_fieldName: string;
	label?: string;
	icon?: string;
	required?: boolean;
	relation: Schema;

	display?: Display;
};

export type Relation_Field = {
	widget: () => {};
	schema: { [Key: string]: any };
	db_fieldName: string;
	label?: string;
	icon: string | undefined;
	strict: boolean;
	required: boolean | undefined;
	relation: Schema;
	display: Display;
	rawDisplay: Display;
};
