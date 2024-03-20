import widgets from '@components/widgets';
import { roles } from './types';
import type { Schema } from './types';
const schema: Schema = {
	// Collection Name coming from filename so not needed

	// Optional & Icon, status, slug
	// See for possible Icons https://icon-sets.iconify.design/
	icon: 'null',
	status: 'unpublished',
	description: 'null',
	slug: 'names',

	// Collection Permissions by user Roles
	permissions: {
		user: {
			read: true
		}
	},

	// Defined Fields that are used in your Collection
	// Widget fields can be inspected for individual options
	fields: [
		widgets.Text({
			label: 'First Name',
			db_fieldName: 'fname',
			translated: true,
			icon: 'ri:t-box-line',
			width: 2,
			placeholder: 'Enter First Name',
			key: 'Text'
		}),
		widgets.Text({ label: 'Last Name', db_fieldName: 'lname', icon: 'ri:t-box-line', width: 2, placeholder: 'Enter Last Name', key: 'Text' }),
		widgets.Email({ label: 'Email', db_fieldName: 'email', icon: 'ic:baseline-email', placeholder: 'Enter Email', key: 'Email' })
	]
};
export default schema;
