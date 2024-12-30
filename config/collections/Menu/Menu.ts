/**
 * @file config/collections/Menu.ts
 * @description Collection file for Menu
 */
import widgets from '@widgets';
import type { Schema } from '@root/src/content/types';

export const schema: Schema = {
	// Collection Name comming from filename, so not needed

	// Optional & Icon, status, slug
	// See for possible Icons https://icon-sets.iconify.design/
	icon: 'bi:menu-button-wide',
	strict: false,
	status: 'published',
	slug: 'menu',

	// Defined Fields that are used in Collection
	// Widget fields can be inspected for individual options

	// Important All MENU Labels need to be called 'Header' for Menu associate children
	fields: [
		widgets.MegaMenu({
			label: 'Menu',
			fields: [
				//level 1
				[
					widgets.Input({
						label: 'Level 1 Name',
						placeholder: 'Enter Category Level 1 Name',
						required: true,
						translated: true
					}),
					widgets.Input({
						label: 'Description',
						placeholder: 'Enter Description Level 1',
						required: true,
						translated: true,
						// Collection Permissions by user Roles. Admin has all permissions by default,
						permissions: {
							editor: {
								read: false,
								write: false
							}
						}
					})
				],
				//level 2
				[
					widgets.Input({
						label: 'Level 2 Name',
						placeholder: 'Enter Category Level 2 Name',
						required: true,
						translated: true
					}),
					widgets.Input({
						label: 'Description',
						placeholder: 'Enter Description Level 2',
						required: true,
						translated: true
					})
				],
				//level 3
				[
					widgets.Input({
						label: 'Level 3 Name',
						placeholder: 'Enter Category Level 3 Name',
						required: true,
						translated: true
					}),
					widgets.Input({
						label: 'Description',
						placeholder: 'Enter Description Level 3',
						required: true,
						translated: true
					})
				],
				//level 4
				[
					widgets.Input({
						label: 'Level 4 Name',
						placeholder: 'Enter Category Level 4 Name',
						required: true,
						translated: true
					}),
					widgets.Input({
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
