import type { Checkbox_Field, Checkbox_Params } from './types';

const widget = ({
	// accept parameters from collection
	db_fieldName,
	icon,
	color,
	required,
	width,
	display
}: Checkbox_Params) => {
	if (!display) display = (data: any, field: any, entry: any) => data;

	const field = {
		schema: {},
		db_fieldName,
		icon,
		color,
		required,
		width,
		display
	} as Checkbox_Field;

	field.schema[db_fieldName] = 'string';

	field.widget = async () => {
		// @ts-ignore
		return (await import('./Checkbox.svelte')).default;
	};
	return field;
};

export default widget;
