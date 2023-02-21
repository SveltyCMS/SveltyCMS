import { PUBLIC_LANGUAGE } from '$env/static/public';
import { findById, flattenData } from '$src/lib/utils/utils';

import type { Display } from '../types';
import type { Relation_Params, Relation_Field } from './types';
const widget = ({
	// Accept parameters from collection
	db_fieldName,
	icon,
	required,
	relation,
	display
}: Relation_Params) => {
	let _display: Display | undefined;
	if (!display) display = async (data: any, field: any, entry: any) => data; //default
	else
		_display = async (data: any, field: any, entry: any) => {
			const { language } = await import('$src/stores/store');
			const { get } = await import('svelte/store');
			let _data = await findById(data, relation);
			_data = flattenData(_data, get(language));
			return await (display as Display)(_data, field, entry);
		};
	if (!_display) _display = display;

	const field = {
		schema: {},
		db_fieldName,
		icon,
		strict: false,
		required,
		relation,
		display: _display,
		rawDisplay: display
	} as Relation_Field;

	field.schema[db_fieldName] = 'string';

	field.widget = async () => {
		// @ts-ignore
		return (await import('./Relation.svelte')).default;
	};
	return field;
};

export default widget;
