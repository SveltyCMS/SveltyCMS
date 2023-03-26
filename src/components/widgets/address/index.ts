import type { Display } from '../types';
import type { Address_Field, Address_Params } from './types';

const widget = ({
	// Accept parameters from collection
	db_fieldName,
	label,
	icon,
	required,
	display
}: Address_Params) => {
	if (!display) display = (data: any, field: any, entry: any) => data;

	const field = { schema: {}, db_fieldName, label, icon, required, display } as Address_Field;

	field.schema[db_fieldName] = {
		latitude: Number,
		longitude: Number,
		name: String,
		street: String,
		zip: String,
		city: String,
		countryAlpha: String
	};

	field.widget = async () => {
		// @ts-ignore
		return (await import('./Address.svelte')).default;
	};
	return field;
};

export default widget;
