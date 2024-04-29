import widgets from '@components/widgets';
import type { Schema } from './types';

const schema: Schema = {
	// Collection Name comming from filename

	// Optional & Icon, status, slug
	// See for possible Icons https://icon-sets.iconify.design/
	icon: 'bi:card-text',
	status: 'published',
	slug: 'posts',
	description: 'Posts Collection',
	revision: true,

	// Collection Permissions by user Roles
	// Admin has all permissions by default
	permissions: {
		developer: {
			create: true,
			read: true,
			write: true,
			delete: true
		},
		editor: {
			create: true,
			read: true
		},
		user: {
			read: true
		}
	},

	// Defined Fields that are used in Collection
	// Widget fields can be inspected for individual options
	fields: [
		widgets.Email({
			label: 'Email',
			icon: 'material-symbols:mail',
			display: async ({ data, contentLanguage }) => {
				return data[contentLanguage];
			}
		}),

		widgets.Text({
			label: 'Test',
			db_fieldName: 'dbtest',
			helper: 'This is the helper text',
			translated: true,
			required: true,
			icon: 'ri:t-box-line',
			placeholder: 'Enter Test Placeholder'
		}),

		widgets.ImageUpload({
			label: 'Image',
			required: true,
			icon: 'material-symbols:image-outline',
			path: 'images' //This save to images folder, and is not globally available
		})

		// widgets.MediaUpload({
		// 	label: 'Image',
		// 	required: true,
		// 	icon: 'material-symbols:image-outline',
		// 	path: 'images' //This save to images folder, and is not globally available
		// 	type: 'image' // Allow only images, or 'video' or 'audio'
		// 	multiupload: true //Allow multiple uploads not working
		// 	watermark: {
		// 		url: '/logo.png', // Adjust URL as needed
		// 		position: 'bottom-right', // Adjust position as needed
		// 		opacity: 0.9, // Adjust opacity (0 - 1)
		// 		scale: 50, // Adjust scale as a percentage
		// 		offsetX: 10, // Adjust horizontal offset in pixels
		// 		offsetY: 20 // Adjust vertical offset in pixels
		// 	}
		// })
	]
};
export default schema;
