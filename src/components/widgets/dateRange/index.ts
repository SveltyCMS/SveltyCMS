// DateRange Widget
import type { Display } from '../types';
import type { DateRange_Field, DateRange_Params } from './type';
const widget = ({
	// Defines type of collections
	db_fieldName,
	icon,
	format,
	required,
	display
}: DateRange_Params) => {
	if (!display) display = (data: any, field: any, entry: any) => data;

	const field = { schema: {}, db_fieldName, icon, format, required, display } as DateRange_Field;

	field.schema[db_fieldName] = 'string';

	field.widget = async () => {
		// @ts-ignore
		return (await import('./DateRange.svelte')).default;
	};
	return field;
};

export default widget;
