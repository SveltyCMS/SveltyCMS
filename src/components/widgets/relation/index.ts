import Relation from './Relation.svelte';
import { findById } from '@src/utils/utils';

import type { Params } from './types';

const widget = ({
	// Accept parameters from collection
	label,
	db_fieldName,
	display,
	icon,
	translated = false,
	relation
}: Params) => {
	if (!display) {
		display = async ({
			data,
			collection,
			field,
			entry,
			contentLanguage
		}: {
			data: any;
			collection: any;
			field: any;
			entry: any;
			contentLanguage: string;
		}) => {
			if (typeof data == 'string') {
				data = await findById(data, relation);
			}
			return data?.text[contentLanguage];
		};
		display.default = true;
	}

	const widget: { type: any; key: 'Relation' } = { type: Relation, key: 'Relation' };

	const field = {
		// standard
		label,
		db_fieldName,
		display,
		icon,
		translated,

		// extras
		relation
	};

	return { ...field, widget };
};

export interface FieldType extends ReturnType<typeof widget> {}
export default widget;
