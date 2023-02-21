import type { Display } from '../types';
import type { Email_Field, Email_Params } from './type';

const widget = ({
	// Accept parameters from collection
	db_fieldName,
	icon,
	placeholder,
	required,
	localization,
	display
}: Email_Params) => {
	if (!display) display = (data: any, field: any, entry: any) => data;

	const field = {
		schema: {},
		db_fieldName,
		icon,
		placeholder,
		required,
		localization,
		display
	} as Email_Field;

	field.schema[db_fieldName] = 'string';

	field.widget = async () => {
		// @ts-ignore
		return (await import('./Email.svelte')).default;
	};
	return field;
};

export default widget;
