import type { Display } from '../types';
import type { ImageUpload_Field, ImageUpload_Params } from './types';
const widget = ({ db_fieldName, path = '', display }: ImageUpload_Params) => {
	if (!display)
		display = async (data: any, field: any, entry: any) => {
			// console.log(data);
			return `<img class='max-w-[200px] inline-block' src="${path}/${data.originalname}" />`;
		};

	const field = { schema: {}, db_fieldName, upload: true, path, display } as ImageUpload_Field;
	field.schema[db_fieldName] = {
		originalname: 'string',
		encoding: 'string',
		mimetype: 'string',
		size: 'number',
		filename: 'string',
		alt: 'string'
	};
	field.widget = async () => {
		// @ts-ignore
		return (await import('./ImageUpload.svelte')).default;
	};
	return field;
};

export default widget;
