/**
 * @file src/presets/demo/collections/names.ts
 * @description Collection file for Names
 */

import type { Schema } from '@root/src/content/types';
import { widgets } from '@src/widgets/proxy';

export const schema: Schema = {
	// Collection Name comming from filename, so not needed
	// Optional & Icon, status, slug
	// See for possible Icons https://icon-sets.iconify.design/
	icon: 'fluent:rename-28-filled',
	description: 'Simple collection for testing relationships and basic input',
	status: 'unpublish',
	revision: true,
	revisionLimit: 2, // limit  number of revisions
	livePreview: '/api/preview?slug=/names/{slug}',

	// Defined Fields that are used in your Collection
	// Widget fields can be inspected for individual options
	fields: [
		widgets.Input({
			label: 'First Name',
			translated: true,
			icon: 'ri:t-box-line',
			placeholder: 'Enter First Name',
			width: 2
		}),
		widgets.Input({
			label: 'Last Name',
			translated: true,
			icon: 'ri:t-box-line',
			placeholder: 'Enter Last Name',
			width: 2,
			required: true,
			permissions: {
				developer: {
					read: false // User cannot read, other roles default to true
				}
			}
		}),

		widgets.RichText({
			label: 'Biography',
			db_fieldName: 'bio',
			icon: 'fluent:text-description-24-filled',
			placeholder: 'Enter extended biography...'
		}),
		widgets.Select({
			label: 'Status',
			db_fieldName: 'status',
			icon: 'fluent:status-24-filled',
			options: [
				{ label: 'Active', value: 'active', color: 'success' },
				{ label: 'Inactive', value: 'inactive', color: 'warning' },
				{ label: 'Archived', value: 'archived', color: 'error' }
			],
			default: 'active'
		})
	]
};
