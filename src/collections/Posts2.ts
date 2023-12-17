import widgets from '@components/widgets';
import { roles } from './types';
import type { Schema } from './types';

const schema: Schema = {
	// Collection Name comming from filename

	// Collection Permissions by user Roles. Admin has all permissions by default,
	permissions: {
		[roles.user]: {
			read: true
		},
		[roles.developer]: {
			read: true
		},
		[roles.editor]: {
			read: true
		}
	},

	// Optional & Icon, status, slug
	// See for possible Icons https://icon-sets.iconify.design/
	icon: 'bi:card-text',

	// Defined Fields that are used in Collection
	// Widget fields can be inspected for individual options
	fields: [
		widgets.Text({
			label: 'Text'
		}),
		widgets.Text({
			label: 'Text2'
		}),
		widgets.Text({
			label: 'Text3',
			translated: false
		})
	]
};
export default schema;
