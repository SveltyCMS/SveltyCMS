import widgets from '@components/widgets';
import { roles } from './types';
import type { Schema } from './types';
const schema: Schema = {
	// Collection Name coming from filename so not needed

	// Optional & Icon, status, slug
	// See for possible Icons https://icon-sets.iconify.design/
	icon: 'ic:sharp-contact-page',
	status: 'unpublished',
	description: 'Names',
	slug: 'names',

	// Collection Permissions by user Roles
	permissions: {
		developer: {
			create: true,
			read: true,
			write: false,
			delete: false
		},
		editor: {
			create: false,
			read: true,
			write: true,
			delete: true
		},
		user: {
			read: true,
			delete: false,
			create: true,
			write: false
		}
	},

	// Defined Fields that are used in your Collection
	// Widget fields can be inspected for individual options
	fields: [
		widgets.Text({ label: 'First Name', translated: true, icon: 'ri:t-box-line', width: 2, placeholder: 'Enter First Name' }),
		widgets.Text({ label: 'Last Name', icon: 'ri:t-box-line', width: 2, placeholder: 'Enter Last Name' })
	]
};
export default schema;
