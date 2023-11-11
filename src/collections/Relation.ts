import widgets from '@src/components/widgets';
import { roles } from './types';
import type { Schema } from './types';

const schema: Schema = {
	// Collection Name comming from filename

	// Optional & Icon, status, slug
	// See for possible Icons https://icon-sets.iconify.design/
	icon: 'mdi:relation-many-to-many',

	// Collection Permissions by user Roles

	// Defined Fields that are used in Collection
	// Widget fields can be inspected for individual options
	fields: [
		widgets.Relation({
			label: 'Relation M2M to Posts',
			db_fieldName: 'relationM2MPosts',
			relation: 'Posts',
			display({ data, contentLanguage }) {
				return data?.['text'][contentLanguage];
			}
		}),
		widgets.Relation({
			label: 'Relation M2M to Posts',
			db_fieldName: 'relationM2MPosts2',
			relation: 'Posts2',
			display({ data, contentLanguage }) {
				return data?.['text'][contentLanguage];
			}
		})
	]
};
export default schema;
