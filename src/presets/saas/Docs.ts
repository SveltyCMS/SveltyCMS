/**
 * @file src/presets/saas/Docs.ts
 * @description Product documentation schema.
 * @author SveltyCMS
 */

import type { Schema } from '@src/content/types';
import { widgets } from '@src/widgets/proxy';

const Docs: Schema = {
	name: 'Docs',
	slug: 'docs',
	icon: 'mdi:book-open-variant',
	description: 'Product documentation',
	fields: [
		widgets.Input({
			label: 'Title',
			db_fieldName: 'title',
			required: true,
			translated: true,
			width: 8
		}),
		widgets.Input({
			label: 'Slug',
			db_fieldName: 'slug',
			required: true,
			width: 4
		}),
		widgets.Relation({
			label: 'Parent Section',
			db_fieldName: 'parent',
			relation: 'Docs',
			display: ({ data }: { data: any }) => data?.title,
			width: 6
		}),
		widgets.Input({
			label: 'Order',
			db_fieldName: 'order',
			type: 'number',
			default: 0,
			width: 6
		}),
		widgets.RichText({
			label: 'Content',
			db_fieldName: 'content',
			translated: true,
			width: 12
		})
	]
};

export default Docs;
