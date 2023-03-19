import type { Display } from '../types';

export type Currency_Field = {
	widget: () => {};
	schema: { [Key: string]: any };
	db_fieldName: string;
	label: string;
	icon: string | undefined;
	placeholder: string | undefined;
	prefix: string | undefined;
	suffix: string | undefined;
	min: number | undefined;
	max: number | undefined;
	step: number | undefined;
	negative: boolean | undefined;
	required: boolean | undefined;
	display: Display;
};
export type Currency_Params = {
	db_fieldName: string;
	label?: string;
	icon?: string;
	placeholder?: string;
	prefix?: string;
	suffix?: string;
	min?: number | undefined;
	max?: number | undefined;
	step?: number | undefined;
	negative?: boolean | undefined;
	required?: boolean;
	display?: Display;
};
