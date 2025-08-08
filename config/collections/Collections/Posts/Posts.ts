/**
 * @file config/collections/Posts.ts
 * @description Collection file for Posts
 */

import widgets from '@widgets';
import type { Schema } from '@root/src/content/types';

export const schema: Schema = {
	// Collection Name comming from filename, so not needed
	// Optional & Icon, status, slug
	// See for possible Icons https://icon-sets.iconify.design/
	icon: 'bi:card-text',
	status: 'publish',
	slug: 'posts',
	description: 'Posts Collection',
	revision: true,

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

		widgets.Input({
			label: 'Test',
			db_fieldName: 'dbtest',
			helper: 'This is the helper text',
			translated: true,
			required: true,
			icon: 'ri:t-box-line',
			placeholder: 'Enter Test Placeholder'
		})

		// widgets.Group({
		// 	label: 'Post Content group',
		// 	fields: [
		// 		widgets.Email({
		// 			label: 'Email in group',
		// 			icon: 'material-symbols:mail',
		// 			display: async ({ data, contentLanguage }) => {
		// 				return data[contentLanguage];
		// 			}
		// 		}),
		// 		widgets.Input({
		// 			label: 'Test in group',
		// 			db_fieldName: 'dbtest',
		// 			helper: 'This is the helper text',
		// 			translated: true,
		// 			required: true,
		// 			icon: 'ri:t-box-line',
		// 			placeholder: 'Enter Test Placeholder'
		// 		})
		// 	]
		// })

		// widgets.ImageUpload({
		// 	label: 'Image',
		// 	required: true,
		// 	icon: 'material-symbols:image-outline',
		// 	folder: 'images' //This save to images folder, and is not globally available
		// })

		// widgets.MediaUpload({
		//     label: 'Media',
		//     required: true,
		//     icon: 'material-symbols:video-library',
		//     folder: 'media', // This saves to media folder, and is not globally available
		//     type: 'video', // Allow only videos
		//     multiupload: true, // Allow multiple uploads
		//     metadata: {
		//         description: 'Sample media description',
		//         author: 'Admin'
		//     },
		//     tags: ['video', 'sample'],
		//     categories: ['tutorial', 'example'],
		//     responsive: true, // Enable responsive image handling
		//     watermark: {
		//         url: '/logo.png', // Adjust URL as needed
		//         position: 'bottom-right', // Adjust position as needed
		//         opacity: 0.9, // Adjust opacity (0 - 1)
		//         scale: 50, // Adjust scale as a percentage
		//         offsetX: 10, // Adjust horizontal offset in pixels
		//         offsetY: 20, // Adjust vertical offset in pixels
		//         rotation: 45 // Adjust rotation in degrees
		//     }
		// })
	]
};
