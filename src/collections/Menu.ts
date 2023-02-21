import { PUBLIC_LANGUAGE } from '$env/static/public';
import widgets from '../components/widgets';

import Posts from './Posts';

import type { Schema } from './types';

const schema: Schema = {
	// Collection Name & Icon (optional) shown on Sidebar
	// See for possible Icons https://icon-sets.iconify.design/
	name: 'Menu',
	icon: 'bi:menu-button-wide',
	strict: false,
	status: 'published',
	// Defined Fields that are used in Collection
	// Inspect Widget fields for possible options
	fields: [
		widgets.MegaMenu({
			db_fieldName: 'Menus',
			menu: [
				{
					fields: [widgets.Text({ db_fieldName: 'Name', icon: 'ri:t-box-line' })]
				},
				{
					fields: [
						widgets.Text({ db_fieldName: 'Name', icon: 'ri:t-box-line' }),
						widgets.Relation({
							db_fieldName: 'bla_name',
							icon: 'ri:t-box-line',
							relation: Posts,
							display: (data: any, field: any, entry: any) => {
								return data.name[PUBLIC_LANGUAGE];
							}
						})
					]
				},
				{
					fields: [
						widgets.Text({ db_fieldName: 'Name', icon: 'ri:t-box-line' }),
						widgets.Text({ db_fieldName: 'Img', icon: 'bi:card-image' }),
						widgets.Text({ db_fieldName: 'Address' })
					]
				},
				{
					fields: [
						widgets.Text({ db_fieldName: 'Name', icon: 'ri:t-box-line' }),
						widgets.Text({ db_fieldName: 'Img', icon: 'bi:card-image' }),
						widgets.Text({ db_fieldName: 'Address' })
					]
				}
			]
		})
	]
};
export default schema;
