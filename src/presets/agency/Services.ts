/**
 * @file src/presets/agency/services.ts
 * @description Agency services schema.
 * @author SveltyCMS
 */

import type { Schema } from '@src/content/types';
import { widgets } from '@src/widgets/proxy';

const Services: Schema = {
	name: 'Services',
	slug: 'services',
	icon: 'mdi:briefcase-outline',
	description: 'Services offered by the agency',
	fields: [
		widgets.Input({
			label: 'Service Title',
			db_fieldName: 'title',
			required: true,
			translated: true,
			width: 8
		}),
		widgets.Input({
			label: 'Icon (Iconify)',
			db_fieldName: 'icon',
			width: 4,
			helper: 'e.g. mdi:web'
		}),
		widgets.Input({
			label: 'Short Description',
			db_fieldName: 'description',
			translated: true,
			width: 12
		})
	]
};

export default Services;
