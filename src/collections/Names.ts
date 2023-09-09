import widgets from '@src/components/widgets';
import { roles } from './types';
import type { Schema } from './types';

const schema: Schema = {
	// Collection Name comming from filename

	// Optional & Icon , status, slug
	// See for possible Icons https://icon-sets.iconify.design/
	icon: 'bi:card-text',
	slug: ' names',

	// Collection Permissions by user Roles
	permissions: {
		[roles.user]: {
			read: false,
			write: false
		}
	},

	// Defined Fields that are used in Collection
	// Widget fields can be inspected for individual options
	fields: [
		widgets.Text({
			label: 'First Name',
			translated: true,
			icon: 'ri:t-box-line',
			placeholder: 'Enter First Name'
		}),
		widgets.Text({
			label: 'Last Name',
			icon: 'ri:t-box-line',
			placeholder: 'Enter Last Name'
		})
	]
};
export default schema;
