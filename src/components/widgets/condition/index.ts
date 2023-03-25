import type { Display } from '../types';
import type { Condition_Field, Condition_Params } from './type';
const widget = ({ db_fieldName, fields, required, display }: Condition_Params) => {
	const field = { schema: {}, db_fieldName, fields, required, display } as Condition_Field;

	field.widget = async () => {
		// @ts-ignore
		return (await import('./Condition.svelte')).default;
	};
	return field;
};

export default widget;
