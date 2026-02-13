// WARNING: Generated file. Do not edit.
// HASH: b27d2a8370d439d2

export const schema = {
    _id: "0f9c9589343b4165b408c5fdb1640ba8",
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
        globalThis.widgets.Email({
            label: 'Email',
            helper: 'This is the helper text for Email',
            icon: 'material-symbols:mail',
            display: async ({ data }) => {
                // Since email is non-translatable, use default language
                const lang = 'en'; // or use publicEnv.DEFAULT_CONTENT_LANGUAGE
                return data[lang];
            }
        }),
        globalThis.widgets.Input({
            label: 'Test',
            db_fieldName: 'dbtest',
            helper: 'This is the helper text for Text',
            translated: true,
            required: true,
            icon: 'ri:t-box-line',
            placeholder: 'Enter Test Placeholder'
        }),
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
        // }),
        globalThis.widgets.MediaUpload({
            label: 'Media',
            required: false, // Temporarily optional for testing
            icon: 'material-symbols:video-library',
            // Watermark preset - auto-applied when editing images
            watermark: {
                url: '/static/watermarks/logo.png', // Place your watermark image here
                position: 'southeast', // bottom-right corner
                scale: 20 // 20% of image width
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
