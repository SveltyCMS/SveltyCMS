import type { Display } from '../types';

export type Text_Field = {
	widget: () => {};
	schema: { [Key: string]: any };
	db_fieldName: string;
	label: string | undefined;
	icon: string | undefined;
	placeholder: string | undefined;
	count: string | undefined;
	minlength: string | undefined;
	maxlength: string | undefined;
	prefix: string | undefined;
	suffix: string | undefined;
	required: boolean | undefined;
	disabled: boolean | undefined;
	readonly: boolean | undefined;
	localization: boolean | undefined;
	width: string | undefined;
	display: Display;
};
export type Text_Params = {
	db_fieldName: string;
	label?: string;
	icon?: string;
	placeholder?: string;
	count?: string;
	minlength?: string;
	maxlength?: string;
	prefix?: string;
	suffix?: string;
	required?: boolean;
	readonly?: boolean;
	disabled?: boolean;
	localization?: boolean;
	width?: string;
	display?: Display;
};
