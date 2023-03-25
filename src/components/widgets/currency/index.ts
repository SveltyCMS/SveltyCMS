import type { Display } from '../types';
import type { Currency_Field, Currency_Params } from './types';

const widget = ({
	// Accept parameters from collection
	db_fieldName,
	label,
	icon,
	placeholder,
	prefix,
	suffix,
	min,
	max,
	step,
	negative,
	required,
	display
}: Currency_Params) => {
	if (!display) display = (data: any, field: any, entry: any) => data;

	const field = {
		schema: {},
		db_fieldName,
		label,
		icon,
		placeholder,
		prefix,
		suffix,
		min,
		max,
		step,
		negative,
		required,
		display
	} as Currency_Field;

	field.schema[db_fieldName] = 'string';

	field.widget = async () => {
		// @ts-ignore
		return (await import('./Currency.svelte')).default;
	};
	return field;
};

export default widget;
