/**
 * @file config/collections/Collections/Names.ts
 * @description Collection file for Names
 */

import type { Schema } from '@root/src/content/types';
import widgets from '@widgets';

export const schema: Schema = {
	// Collection Name comming from filename, so not needed
	// Optional & Icon, status, slug
	// See for possible Icons https://icon-sets.iconify.design/
	icon: 'fluent:rename-28-filled',
	status: 'unpublished',
	revision: true,
	revisionLimit: 2, // limit  number of revisions
	livePreview: true,

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
		})
	]
};
