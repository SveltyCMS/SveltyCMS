/**
 * @file src/presets/corporate/Careers.ts
 * @description Corporate job listings schema.
 * @author SveltyCMS
 */

import type { Schema } from '@src/content/types';
import { widgets } from '@src/widgets/proxy';

const Careers: Schema = {
	name: 'Careers',
	slug: 'careers',
	icon: 'mdi:briefcase-search-outline',
	description: 'Open job positions',
	fields: [
		widgets.Input({
			label: 'Job Title',
			db_fieldName: 'title',
			required: true,
			translated: true,
			width: 8
		}),
		widgets.Input({
			label: 'Department',
			db_fieldName: 'department',
			width: 4
		}),
		widgets.Input({
			label: 'Location',
			db_fieldName: 'location',
			default: 'Remote',
			width: 6
		}),
		widgets.Input({
			label: 'Type',
			db_fieldName: 'type',
			helper: 'Full-time, Contract, etc.',
			width: 6
		}),
		widgets.RichText({
			label: 'Job Description',
			db_fieldName: 'description',
			translated: true,
			width: 12
		})
	]
};

export default Careers;
