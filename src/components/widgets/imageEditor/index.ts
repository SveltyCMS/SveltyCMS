import type { Display } from '../types';
export default ({
	title,
	path = '',
	display
}: {
	title: string;
	path: string;
	display?: Display;
}) => {
	if (!display)
		display = async (data: any, field: any, entry: any) =>
			`<img class='max-w-[200px] inline-block' src="${path}/${data?.originalname}" />`;
	const field: any = {
		schema: {},
		title,
		upload: true,
		path,
		display,
		rotate: 0,
		crop_top: 10,
		crop_bottom: 10,
		crop_left: 10,
		crop_right: 10,
		width: 0,
		height: 0
	};
	field.schema[title] = {
		originalname: 'string',
		encoding: 'string',
		mimetype: 'string',
		size: 'number',
		filename: 'string',
		alt: 'string'
	};
	field.widget = async () => {
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		return (await import('./ImageEditor.svelte')).default;
	};
	return field;
};
