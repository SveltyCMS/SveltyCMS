import { PUBLIC_LANGUAGE } from '$env/static/public';
import { format } from '$src/lib/utils/utils';
import widgets from '../components/widgets';

import type { Schema } from './types';

const schema: Schema = {
	// Collection Name & Icon (optional) shown on Sidebar
	// See for possible Icons https://icon-sets.iconify.design/
	name: 'Posts',
	icon: 'bi:card-text',
	status: 'published',
	// Defined Fields that are used in Collection
	// Inspect Widget fields for possible options
	fields: [
		widgets.Group({
			db_fieldName: 'User',
			display: async (data: any, field: any, entry: any) => {
				//console.log(entry);
				return format([
					{
						label: 'Name',
						text: entry.First,

						newLine: true
					},
					{
						text: entry.Middle,
						labelColor: 'blue',
						textColor: 'yellow',
						newLine: false
					},
					{
						text: entry.Last,
						labelColor: 'blue',
						textColor: 'green',
						newLine: false
					}
				]);
			},
			fields: [
				widgets.Text({
					db_fieldName: 'First',
					icon: 'ri:t-box-line',
					placeholder: 'Enter First Name',
					required: true,
					localization: true,
					width: '30%'
				}),

				widgets.Text({
					db_fieldName: 'Middle',
					icon: 'ri:t-box-line',
					placeholder: 'Enter Last Name',
					required: false,
					localization: false,
					width: '70%'
				}),
				widgets.Text({
					db_fieldName: 'Last',
					icon: 'ri:t-box-line',
					placeholder: 'Enter Last Name',
					required: false,
					localization: false
				})
			]
		})
	]
};
export default schema;

// widgets.DateRange({ db_fieldName: "DateRange Not working", required: true }),
// widgets.Date({ db_fieldName: "DateNot working", required: true }),
