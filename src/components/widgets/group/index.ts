import type { Display } from '../types';
import type { Group_Field, Group_Params } from './type';
const widget = ({ db_fieldName, fields, required, display }: Group_Params) => {
	const field = { schema: {}, db_fieldName, fields, required, display } as Group_Field;

	field.widget = async () => {
		// @ts-ignore
		return (await import('./Group.svelte')).default;
	};
	return field;
};

export default widget;
