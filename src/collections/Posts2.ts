import widgets from '@components/widgets';
import type { Schema } from './types';

const schema: Schema = {
	// Collection Name comming from filename

	// Optional & Icon, status, slug
	// See for possible Icons https://icon-sets.iconify.design/
	icon: 'bi:card-text',

	// Collection Permissions by user Roles. Admin has all permissions by default,
	permissions: {
		developer: {
			create: true,
			read: true,
			write: true,
			delete: true
		},
		editor: {
			create: false,
			read: true
		},
		user: {
			read: true
		}
	},

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
			permissions: {
				developer: {
					read: true,
					write: true
				}
			}
		})
	]
};
export default schema;
