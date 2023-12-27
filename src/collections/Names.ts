import widgets from '@components/widgets';
import { roles } from './types';
import type { Schema } from './types';

const schema: Schema = {
	// Collection Name comming from filename

	// Optional & Icon, status, slug
	// See for possible Icons https://icon-sets.iconify.design/
	icon: 'fluent:rename-28-filled',
	status: 'unpublished',
	slug: ' names',

	// Collection Permissions by user Roles. Admin has all permissions by default,
	permissions: {
		[roles.developer]: {
			create: true,
			read: true,
			write: true
		},
		[roles.editor]: {
			read: true
		}
	},

	// Defined Fields that are used in Collection
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
			icon: 'ri:t-box-line',
			placeholder: 'Enter Last Name',
			width: 2
		})
	]
};
export default schema;
