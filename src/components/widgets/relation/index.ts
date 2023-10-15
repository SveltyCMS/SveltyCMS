import Relation from './Relation.svelte';
import { findById } from '@src/utils/utils';

import { type Params, GuiSchema, GraphqlSchema } from './types';
import { defaultContentLanguage } from '@src/stores/store';

const widget = ({
	// Accept parameters from collection
	label,
	db_fieldName,
	display,
	icon,
	translated = false,

	// extras
	relation
}: Params) => {
	if (!display) {
		display = async ({ data, collection, field, entry, contentLanguage }) => {
			if (typeof data == 'string') {
				data = await findById(data, relation);
			}
			return Object.values(data)[1]?.[contentLanguage] || Object.values(data)[1]?.[defaultContentLanguage] || Object.values(data)[1];
		};
		display.default = true;
	} else {
		const _display = display;
		display = async ({ data, collection, field, entry, contentLanguage }) => {
			if (typeof data == 'string') {
				data = await findById(data, relation);
			}
			return _display?.({ data, collection, field, entry, contentLanguage });
		};
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

widget.GuiSchema = GuiSchema;
widget.GraphqlSchema = GraphqlSchema;

export interface FieldType extends ReturnType<typeof widget> {}
export default widget;
