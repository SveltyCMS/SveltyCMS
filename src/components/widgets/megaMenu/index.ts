import type { Display } from '../types';
import type { MegaMenu_Field, MegaMenu_Params } from './types';
const widget = ({
	// Accept parameters from collection
	db_fieldName,
	menu,
	required,
	localization,
	display
}: MegaMenu_Params) => {
	if (!display)
		display = async (data: any, field: any, entry: any) => {
			const { language } = await import('../../../stores/store');
			const { get } = await import('svelte/store');
			return data.Name[get(language)];
		};

	const field = {
		schema: {},
		db_fieldName,
		menu,
		strict: false,
		required,
		localization,
		display
	} as MegaMenu_Field;

	field.schema[db_fieldName] = {};

	field.widget = async () => {
		// @ts-ignore
		return (await import('./MegaMenu.svelte')).default;
	};
	return field;
};

export default widget;
