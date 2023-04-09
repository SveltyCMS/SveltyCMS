import { format } from '$src/lib/utils/utils';
import { get } from 'svelte/store';

import widgets from '../components/widgets';
import type { Schema } from './types';

// typesafe-i18n
import LL from '$i18n/i18n-svelte';

const schema: Schema = {
	// Collection Name & Icon (optional) shown on Sidebar
	// See for possible Icons https://icon-sets.iconify.design/
	name: 'Posts',
	icon: 'bi:card-text',
	status: 'published',
	slug: ' posts',

	// Defined Fields that are used in Collection
	// Inspect Widget fields for possible options

	fields: [
		widgets.Text({
			db_fieldName: 'Title',
			icon: 'ri:t-box-line',
			placeholder: 'Enter Title',
			required: true,
			localization: true
		}),

		// widgets.RichText({
		// 	db_fieldName: 'Description',
		// 	icon: 'ri:t-box-line',
		// 	placeholder: 'Enter Description',
		// 	label: 'Body',
		// 	required: true,
		// 	localization: true
		// }),

		widgets.Seo({
			db_fieldName: 'Basic Seo',
			label: 'Seo label',
			icon: 'icon-park-outline:seo',
			localization: true,
			required: true
		})
	]
};
export default schema;
