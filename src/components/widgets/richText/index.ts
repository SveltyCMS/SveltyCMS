import type { Display } from '../types';

const widget = ({
	db_fieldName,
	label,
	required,
	localization,
	display
}: {
	db_fieldName: string;
	label?: string;
	required?: boolean;
	localization?: boolean;
	display?: Display;
}) => {
	if (!display) display = (data: any, field: any, entry: any) => data;
	const field: any = {
		schema: {},
		db_fieldName,
		label,
		required,
		localization,
		display
	};
	field.schema[db_fieldName] = 'string';
	field.widget = async () => {
		// @ts-ignore
		return (await import('./RichText.svelte')).default;
	};
	return field;
};
export default widget;
