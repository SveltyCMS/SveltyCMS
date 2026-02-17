/**
 * @file config/collections/Posts.ts
 * @description Collection file for Posts
 */

import type { FieldInstance, Schema } from '@root/src/content/types';
import { widgets } from '@src/widgets/proxy';

export const schema: Schema = {
	// Collection Name comming from filename, so not needed
	// Optional & Icon, status, slug
	// See for possible Icons https://icon-sets.iconify.design/
	icon: 'bi:card-text',
	status: 'publish',
	slug: 'posts',
	description: 'Blog posts demo with Media handling and Watermark testing',
	revision: true,

	// Defined Fields that are used in Collection
	// Widget fields can be inspected for individual options
	fields: [
		widgets.Email({
			label: 'Email',
			helper: 'This is the helper text for Email',
			icon: 'material-symbols:mail',
			display: async ({ data }: Parameters<NonNullable<FieldInstance['display']>>[0]) => {
				// Since email is non-translatable, use default language
				const lang = 'en'; // or use publicEnv.DEFAULT_CONTENT_LANGUAGE
				return data[lang as string] as string;
			}
		}),

		widgets.Input({
			label: 'Test',
			db_fieldName: 'dbtest',
			helper: 'This is the helper text for Text',
			translated: true,
			required: true,
			icon: 'ri:t-box-line',
			placeholder: 'Enter Test Placeholder'
		}),

		widgets.Group({
			label: 'Post Content group',
			db_fieldName: 'content_group',
			fields: [
				widgets.Email({
					label: 'Email in group',
					db_fieldName: 'group_email',
					icon: 'material-symbols:mail',
					display: async ({ data, contentLanguage }: { data: any; contentLanguage: string }) => {
						return data[contentLanguage] as string;
					}
				}),
				widgets.Input({
					label: 'Test in group',
					db_fieldName: 'group_text',
					helper: 'This is the helper text',
					translated: true,
					required: true,
					icon: 'ri:t-box-line',
					placeholder: 'Enter Test Placeholder'
				})
			]
		}),

		widgets.MediaUpload({
			label: 'Featured Media',
			db_fieldName: 'media',
			required: false,
			icon: 'material-symbols:video-library',
			folder: 'collections/posts', // ✅ Save files under collection/posts
			multiupload: true, // ✅ Allow multiple files
			// Watermark preset - auto-applied when editing/saving images
			watermark: {
				text: 'Asset Trade', // Text watermark
				position: 'bottom-right',
				opacity: 0.8,
				scale: 1.5 // Relative size
			}
		})

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
