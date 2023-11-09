import widgets from '@src/components/widgets';
import { roles } from './types';
import type { Schema } from './types';

const schema: Schema = {
	// Collection Name comming from filename

	// Optional & Icon , status, slug
	// See for possible Icons https://icon-sets.iconify.design/
	icon: 'mdi:relation-many-to-many',

	// Collection Permissions by user Roles

	// Defined Fields that are used in Collection
	// Widget fields can be inspected for individual options
	fields: [
		widgets.Relation({
			label: 'Relation M2M to Posts',
			db_fieldName: 'relation',
			relation: 'Posts',
			display({ data, contentLanguage }) {
				return data?.['text 2'][contentLanguage];
			}
		}),
		widgets.Relation({
			label: 'Relation M2M to Posts2',
			db_fieldName: 'relation',
			relation: 'Posts2',
			display({ data, contentLanguage }) {
				return data?.['text 2'][contentLanguage];
			}
		})
	]
};
export default schema;
