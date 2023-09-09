import widgets from '@src/components/widgets';
import { roles } from './types';
import type { Schema } from './types';

const schema: Schema = {
	// Collection Name comming from filename

	// Optional & Icon , status, slug
	// See for possible Icons https://icon-sets.iconify.design/
	icon: 'bi:images',

	// Collection Permissions by user Roles

	// Defined Fields that are used in Collection
	// Widget fields can be inspected for individual options
	fields: [
		widgets.ImageArray({
			label: 'Images Array',
			imageUploadTitle: 'image',
			fields: [
				widgets.ImageUpload({
					label: 'image',
					path: 'global'
				}),
				widgets.Text({
					label: 'Image Title',
					db_fieldName: 'title',
					placeholder: 'Enter Title'
				}),
				widgets.Text({
					label: 'Alt Text',
					db_fieldName: 'alt',
					placeholder: 'Enter Alt Text',
					required: true
				})
			]
		})
	]
};

export default schema;
