/**
 * @file src/presets/agency/testimonials.ts
 * @description Client testimonials schema.
 * @author SveltyCMS
 */

import type { Schema } from '@src/content/types';
import { widgets } from '@src/widgets/proxy';

const Testimonials: Schema = {
	name: 'Testimonials',
	slug: 'testimonials',
	icon: 'mdi:comment-quote-outline',
	description: 'Client testimonials',
	fields: [
		widgets.Relation({
			label: 'Client',
			db_fieldName: 'client',
			relation: 'Clients',
			display: ({ data }: { data: any }) => data?.name,
			width: 6
		}),
		widgets.Input({
			label: 'Person Name',
			db_fieldName: 'author',
			required: true,
			width: 6
		}),
		widgets.Input({
			label: 'Role / Position',
			db_fieldName: 'role',
			width: 12
		}),
		widgets.Input({
			label: 'Quote',
			db_fieldName: 'quote',
			translated: true,
			required: true,
			width: 12
		})
	]
};

export default Testimonials;
