import type { Display } from '../types';
import type { MegaMenu_Field, MegaMenu_Params } from './types';
let widget =  ({
	// Accept parameters from collection
	db_fieldName,
	menu,
	required,
	localization,
	display
}: MegaMenu_Params) => {
	if (!display) display = async (data: any, field: any, entry: any) => {
		let { language } = await import('../../../stores/store')
		let { get } = await import('svelte/store')
		return data.Name[get(language)]
	};

	let field = { schema: {}, db_fieldName, menu, strict: false, required, localization, display } as MegaMenu_Field;

	field.schema[db_fieldName] = {};

	field.widget = async () => {
		// @ts-ignore
		return (await import('./MegaMenu.svelte')).default;
	};
	return field;
};

export default widget