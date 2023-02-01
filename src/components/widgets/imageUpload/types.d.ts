import type { Display } from '../types';

export type ImageUpload_Field = {
	widget: () => {};
	schema: { [Key: string]: any };
	db_fieldName: string;
	label: string;
	upload: true;
	path: string;
	display: Display;
};
export type ImageUpload_Params = {
	db_fieldName: string;
	label?: string;
	path: string;
	display?: Display;
};
