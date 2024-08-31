/**
 * @file src/collections/Names.ts
 * @description Collection file for Names
 */

import widgets from '@components/widgets';
import type { Schema } from './types';

const schema: Schema = {
	// Collection Name coming from filename so not needed

	// Optional & Icon, status, slug
	// See for possible Icons https://icon-sets.iconify.design/
	icon: 'fluent:rename-28-filled',
	status: 'unpublished',
	revision: true,
	livePreview: true,

	// Collection Permissions by user Roles
	permissions: {
		developer: {
			read: false // Developer cannot read, other roles default to true
		}
		// You can add more roles with specific restrictions if needed
	},

	// Defined Fields that are used in your Collection
	// Widget fields can be inspected for individual options
	fields: [
		widgets.Text({
			label: 'First Name',
			translated: true,
			icon: 'ri:t-box-line',
			placeholder: 'Enter First Name',
			width: 2
		}),
		widgets.Text({
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
export default schema;
