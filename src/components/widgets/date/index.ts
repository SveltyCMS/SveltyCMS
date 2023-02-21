// Date Widget
import type { Display } from '../types';
import type { Date_Field, Date_Params } from './types';

const widget = ({
	// Defines type of collections
	db_fieldName,
	icon,
	required,
	display
}: Date_Params) => {
	if (!display) display = (data: any, field: any, entry: any) => data;

	const field = { schema: {}, db_fieldName, icon, required, display } as Date_Field;
	field.schema[db_fieldName] = 'string';

	field.widget = async () => {
		// @ts-ignore
		return (await import('./Date.svelte')).default;
	};
	return field;
};

export default widget;
