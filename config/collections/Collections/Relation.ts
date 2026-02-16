/**
 * @file config/collections/Relation.ts
 * @description Collection file for Relation
 */

import { widgets } from '@src/widgets/proxy';
import type { Schema } from '@root/src/content/types';

export const schema: Schema = {
	// Collection Name comming from filename, so not needed

	// Optional & Icon, status, slug
	// See for possible Icons https://icon-sets.iconify.design/
	icon: 'mdi:relation-many-to-many',
	description: 'Demonstrates Many-to-Many relationships',

	// Defined Fields that are used in Collection
	// Widget fields can be inspected for individual options
	fields: [
		widgets.Relation({
			label: 'Relation M2M to Posts',
			db_fieldName: 'relationM2MPosts',
			collection: 'names',
			displayField: 'name',
			helper: 'This is a required relation to a user'
		}),

		widgets.Relation({
			label: 'Multiple Relations (Tags)',
			db_fieldName: 'tags',
			collection: 'names',
			displayField: 'name',
			multiple: true,
			min: 1,
			max: 5,
			icon: 'mdi:tag-multiple',
			helper: 'Select up to 5 tags (Many-to-Many example)'
		})
	]
};
