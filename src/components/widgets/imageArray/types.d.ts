import type { Display } from '../types';
import type { Widgets } from '$src/components/widgets';
export type ImageArray_Field = {
	widget: () => {};
	schema: { [Key: string]: any };
	db_fieldName: string;
	label: string;
	imageUploadTitle: string;
	icon: string | undefined;
	upload: boolean;
	fields: Array<any>;
	required: boolean | undefined;
	display: Display;
};

type x = Omit<Widgets, 'ImageArray'>;
export type ImageArray_Params = {
	// Defines type of collections
	db_fieldName: string;
	label?: string;
	imageUploadTitle: string;
	icon?: string;
	required?: boolean;
	fields: Array<ReturnType<x[keyof x]>>;
	display?: Display;
};
