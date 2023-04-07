import widgets from '../components/widgets';
import type { Schema } from './types';

const schema: Schema = {
	// collection Name and Icon
	name: 'Image Editor',
	icon: 'bi:images',
	slug: 'editor',
	status: 'published',

	// collection fields from available widgets
	fields: [
		widgets.ImageEditorPage({
			title: 'Image',
			fields: [widgets.ImageEditor({ title: 'Multi Image Array', path: 'media/image_array' })]
		})
	]
};

export default schema;
