import type { Display } from '../types';
import type { PhoneNumber_Field, PhoneNumber_Params } from './types';

const widget = ({
	// Accept parameters from collection
	db_fieldName,
	icon,
	placeholder,
	required,
	display
}: PhoneNumber_Params) => {
	if (!display) display = (data: any, field: any, entry: any) => data;

	const field = {
		schema: {},
		db_fieldName,
		icon,
		placeholder,
		required,
		display
	} as PhoneNumber_Field;

	field.schema[db_fieldName] = 'string';

	field.widget = async () => {
		// @ts-ignore
		return (await import('./PhoneNumber.svelte')).default;
	};
	return field;
};

export default widget;
