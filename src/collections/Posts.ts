import widgets from '@src/components/widgets';
import { roles } from './types';
import type { Schema } from './types';

const schema: Schema = {
	// Collection Name comming from filename

	// Optional & Icon , status, slug
	// See for possible Icons https://icon-sets.iconify.design/
	icon: 'bi:card-text',
	status: 'published',
	slug: 'posts',

	// Collection Permissions by user Roles

	// Defined Fields that are used in Collection
	// Widget fields can be inspected for individual options
	fields: [
		widgets.Email({
			label: 'email',
			icon: 'material-symbols:mail'
			// display: async (data, field, entry, contentLanguage) => {
			// 	return data[contentLanguage];
			// },
		}),

		widgets.Text({
			label: 'test',
			db_fieldName: 'dbtest',
			translated: true,
			required: true,
			icon: 'ri:t-box-line',
			placeholder: 'Enter Test Placeholder'
		}),

		widgets.ImageUpload({
			label: 'image',
			required: true,
			icon: 'material-symbols:image-outline',
			path: 'images' //This save to image folder, and is not globally available
		}),

		widgets.FileUpload({
			label: 'File',
			required: true,
			icon: 'mdi:file-document-outline',
			path: 'files' //This save to image folder, and is not globally available
		})
	]
};
export default schema;
