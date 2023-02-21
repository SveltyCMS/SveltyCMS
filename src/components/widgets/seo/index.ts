import type { Seo_Field, Seo_Params } from './types';

const widget = ({
	// accept parameters from collection
	db_fieldName,
	icon,
	required,
	localization,
	display
}: Seo_Params) => {
	if (!display)
		display = async (data: any, field: any, entry: any) => {
			return data || 'No Value';
		};
	const field = {
		schema: {},
		db_fieldName,
		icon,
		required,
		localization,
		display
	} as Seo_Field;

	field.schema[db_fieldName] = { String: String };

	field.widget = async () => {
		// @ts-ignore
		return (await import('./Seo.svelte')).default;
	};
	return field;
};

export default widget;
