import type { Display } from '../types';
import type { Url_Params, Url_Field } from './types';

export default ({
	// Accept parameters from collection
	db_fieldName,
	icon,
	placeholder,
	required,
	localization,
	display
}: Url_Params) => {
	if (!display) display = (data: any, field: any, entry: any) => data;

	const field = {
		schema: {},
		db_fieldName,
		icon,
		placeholder,
		required,
		localization,
		display
	} as Url_Field;

	field.schema[db_fieldName] = 'string';

	field.widget = async () => {
		// @ts-ignore
		return (await import('./Url.svelte')).default;
	};
	return field;
};
