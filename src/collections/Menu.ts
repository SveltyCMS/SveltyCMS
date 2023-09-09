import widgets from '@src/components/widgets';
import { roles } from './types';
import type { Schema } from './types';

const schema: Schema = {
	// Collection Name comming from filename

	// Optional & Icon , status, slug
	// See for possible Icons https://icon-sets.iconify.design/
	icon: 'bi:menu-button-wide',
	strict: false,
	status: 'published',
	slug: 'menu',

	/**
	 * Specifies access rights for user roles.
	 * `read` and `write` properties define read/write access for each role.
	 */
	permissions: {
		[roles.admin]: {
			read: true,
			write: true
		}
		// other roles...
	},

	// Defined Fields that are used in Collection
	// Widget fields can be inspected for individual options

	// Important All MENU Labels need to be called 'Header' for Menu associate children
	fields: [
		widgets.MegaMenu({
			label: 'Menu',
			menu: [
				{
					fields: [
						widgets.Text({
							label: 'Header',
							placeholder: 'Enter Menu Name',
							required: true,
							translated: true
						})
					]
				},
				{
					fields: [
						widgets.Text({
							label: 'Header',
							placeholder: 'Enter Category Level 1 Name',
							required: true,
							translated: true
						}),
						widgets.Text({
							label: 'Description',
							placeholder: 'Enter Description Level 1',
							required: true,
							translated: true
						}),
						widgets.ImageUpload({
							label: 'image',
							required: true,
							icon: 'material-symbols:image-outline',
							path: 'global'
						}),
						widgets.Text({
							label: 'Title',
							placeholder: 'Image Title',
							required: true,
							translated: true
						}),
						widgets.Text({
							label: 'Alt Text',
							placeholder: 'Image Alt Text',
							required: true,
							translated: true
						}),

						widgets.Seo({
							label: 'Seo',
							translated: true
						})
					]
				},
				{
					fields: [
						widgets.Text({
							label: 'Header',
							placeholder: 'Enter Category Level 2 Name',
							required: true,
							translated: true
						}),
						widgets.Text({
							label: 'Description',
							placeholder: 'Enter Description Level 2',
							required: true,
							translated: true
						}),

						widgets.ImageUpload({
							label: 'Image',
							path: 'global'
						}),

						widgets.Text({
							label: 'Title',
							placeholder: 'Image Title',
							required: true,
							translated: true
						}),
						widgets.Text({
							label: 'Alt Text',
							placeholder: 'Image Alt Text',
							required: true,
							translated: true
						}),

						widgets.Seo({
							label: 'Seo',
							translated: true
						})
					]
				}
			]
		})
	]
};
export default schema;
