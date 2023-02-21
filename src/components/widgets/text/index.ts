import type { Text_Field, Text_Params } from './types';
const widget = ({
	// accept parameters from collection
	db_fieldName,
	icon,
	placeholder,
	count,
	minlength,
	maxlength,
	prefix,
	suffix,
	required,
	readonly,
	localization,
	width,
	display
}: Text_Params) => {
	if (!display)
		display = async (data: any, field: any, entry: any) => {
			return data || 'No Value';
		};
	const field = {
		schema: {},
		db_fieldName,
		icon,
		placeholder,
		count,
		minlength,
		maxlength,
		prefix,
		suffix,
		required,
		readonly,
		localization,
		width,
		display
	} as Text_Field;
	field.schema[db_fieldName] = { String: String };
	field.widget = async () => {
		// @ts-ignore
		return (await import('./Text.svelte')).default;
	};
	return field;
};

export default widget;
