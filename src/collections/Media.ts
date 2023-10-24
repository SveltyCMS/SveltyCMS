import widgets from '../components/widgets';
import type { Schema } from './types';
let schema: Schema = {
	fields: [widgets.ImageUpload({ label: 'Image', path: 'global' })]
};
export default schema;
