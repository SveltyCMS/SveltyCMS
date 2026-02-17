/**
 * @file src/presets/blog/Categories.ts
 * @description Blog categories schema.
 * @author SveltyCMS
 */

import type { Schema } from '@src/content/types';
import { widgets } from '@src/widgets/proxy';

const Categories: Schema = {
	name: 'Categories',
	slug: 'categories',
	icon: 'mdi:shape',
	description: 'Blog categories',
	fields: [
		widgets.Input({
			label: 'Name',
			db_fieldName: 'name',
			required: true,
			translated: true,
			width: 6
		}),
		widgets.Input({
			label: 'Slug',
			db_fieldName: 'slug',
			required: true,
			width: 6
		}),
		widgets.Input({
			label: 'Description',
			db_fieldName: 'description',
			translated: true,
			width: 12
		})
	]
};

export default Categories;
