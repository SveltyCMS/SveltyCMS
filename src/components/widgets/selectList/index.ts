import type { Display } from '../types';
import type { SelectList_Field, SelectList_Params } from './type';

const widget = ({
	// Accept parameters from collection
	db_fieldName,
	icon,
	placeholder,
	required,
	localization,
	width,
	options,
	display
}: SelectList_Params) => {
	if (!display) display = (data: any, field: any, entry: any) => data;

	const field = {
		schema: {},
		db_fieldName,
		icon,
		placeholder,
		required,
		localization,
		options,
		width,
		display
	} as SelectList_Field;

	field.schema[db_fieldName] = 'string';

	field.widget = async () => {
		// @ts-ignore
		return (await import('./SelectList.svelte')).default;
	};
	return field;
};

export default widget;
