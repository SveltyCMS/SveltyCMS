import widgets from '@components/widgets';
import { roles } from './types';
import type { Schema } from './types';

const schema: Schema = {
	// Collection Name comming from filename

	// Optional & Icon, status, slug
	// See for possible Icons https://icon-sets.iconify.design/
	icon: 'bi:menu-button-wide',
	strict: false,
	status: 'published',
	slug: 'menu',

	// Collection Permissions by user Roles. Admin has all permissions by default,
	permissions: {
		editor: {
			read: true,
			write: true
		}
	},

	// Defined Fields that are used in Collection
	// Widget fields can be inspected for individual options

	// Important All MENU Labels need to be called 'Header' for Menu associate children
	fields: [
		widgets.MegaMenu({
			label: 'Menu',
			menu: [
				//level 1
				[
					widgets.Text({
						label: 'Level 1 Name',
						placeholder: 'Enter Category Level 1 Name',
						required: true,
						translated: true
					}),
					widgets.Text({
						label: 'Description',
						placeholder: 'Enter Description Level 1',
						required: true,
						translated: true
					})
				],
				//level 2
				[
					widgets.Text({
						label: 'Level 2 Name',
						placeholder: 'Enter Category Level 2 Name',
						required: true,
						translated: true
					}),
					widgets.Text({
						label: 'Description',
						placeholder: 'Enter Description Level 2',
						required: true,
						translated: true
					})
				],
				//level 3
				[
					widgets.Text({
						label: 'Level 3 Name',
						placeholder: 'Enter Category Level 3 Name',
						required: true,
						translated: true
					}),
					widgets.Text({
						label: 'Description',
						placeholder: 'Enter Description Level 3',
						required: true,
						translated: true
					})
				],
				//level 4
				[
					widgets.Text({
						label: 'Level 4 Name',
						placeholder: 'Enter Category Level 4 Name',
						required: true,
						translated: true
					}),
					widgets.Text({
						label: 'Description',
						placeholder: 'Enter Description Level 4',
						required: true,
						translated: true
					})
				]
			]
		})
	]
};
export default schema;
