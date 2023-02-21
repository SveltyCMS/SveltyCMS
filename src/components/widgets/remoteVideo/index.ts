import type { Display } from '../types';
import type { RemoteVideo_Params, RemoteVideo_Field } from './types';

export default ({
	// Accept parameters from collection
	db_fieldName,
	icon,
	placeholder,
	required,
	display
}: RemoteVideo_Params) => {
	if (!display) display = (data: any, field: any, entry: any) => data;

	const field = {
		schema: {},
		db_fieldName,
		icon,
		placeholder,
		required,
		display
	} as RemoteVideo_Field;

	field.schema[db_fieldName] = 'string';

	field.widget = async () => {
		// @ts-ignore
		return (await import('./RemoteVideo.svelte')).default;
	};
	return field;
};
