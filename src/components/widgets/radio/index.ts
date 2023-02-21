import type { Radio_Field, Radio_Params } from './types';

const widget = ({
	// accept parameters from collection
	db_fieldName,
	icon,
	color,
	width,
	required,
	display
}: Radio_Params) => {
	if (!display) display = (data: any, field: any, entry: any) => data;

	const field = { schema: {}, db_fieldName, icon, color, width, required, display } as Radio_Field;

	field.schema[db_fieldName] = 'string';

	field.widget = async () => {
		// @ts-ignore
		return (await import('./Radio.svelte')).default;
	};
	return field;
};

export default widget;
