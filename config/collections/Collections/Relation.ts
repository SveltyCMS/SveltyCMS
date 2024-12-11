// UUID: a6c144ee-dc58-4781-b7ed-777ba3577b18
/**
 * @file config/collections/Relation.ts
 * @description Collection file for Relation
 */

import widgets from '@components/widgets';
import type { Schema } from '@src/collections/types';

export const schema: Schema = {
	// Collection Name comming from filename, so not needed

	// Optional & Icon, status, slug
	// See for possible Icons https://icon-sets.iconify.design/
	icon: 'mdi:relation-many-to-many',

	// Defined Fields that are used in Collection
	// Widget fields can be inspected for individual options
	fields: [
		widgets.Relation({
			label: 'Relation M2M to Posts',
			db_fieldName: 'relationM2MPosts',
			relation: 'Names',
			displayPath: 'Last Name'
		})
	]
};
