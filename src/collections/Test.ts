import widgets from '../components/widgets';
import { format } from '$src/lib/utils/utils';
import { get } from 'svelte/store';
import type { Schema } from './types';

// typesafe-i18n
import LL from '$i18n/i18n-svelte';

const schema: Schema = {
	// Collection Name & Icon (optional) shown on Sidebar
	// See for possible Icons https://icon-sets.iconify.design/
	name: 'TestWidgets',
	icon: 'bi:device-ssd-fill',
	status: 'published',

	// Defined Fields that are used in Collection
	// Inspect Widget fields for possible options
	fields: [
		widgets.Group({
			db_fieldName: 'User',
			label: get(LL).COLLECTION_TEST_User(),
			display: async (data: any, field: any, entry: any) => {
				return format([
					{
						label: 'Prefix',
						text: entry.Prefix,
						newLine: true // not working
					},
					{
						label: 'Name',
						text: entry.First
					},
					{
						text: entry.Last,
						labelColor: 'blue',
						textColor: 'green',
						newLine: true // not working
					}
				]);
			},
			fields: [
				widgets.SelectList({
					db_fieldName: 'Prefix',
					label: get(LL).COLLECTION_TEST_Prefix(),
					icon: 'ri:t-box-line',
					placeholder: get(LL).COLLECTION_TEST_Prefix_placeholder(),
					width: '100%',

					//options: get(LL).COLLECTION_TEST_Prefix_data()
					options: ['Mr.', 'Ms.', 'Mrs.', 'Dr.']
					// options: ['Herr.', 'Frau.', 'Fraulein', 'Dr.']
				}),

				widgets.Text({
					db_fieldName: 'First',
					label: get(LL).COLLECTION_TEST_First(),
					icon: 'ri:t-box-line',
					placeholder: get(LL).COLLECTION_TEST_First_placeholder(),
					required: true,
					width: '33%'
				}),

				widgets.Text({
					db_fieldName: 'Middle',
					label: get(LL).COLLECTION_TEST_Middle(),
					icon: 'ri:t-box-line',
					placeholder: get(LL).COLLECTION_TEST_Middle_placeholder(),
					required: false,
					readonly: true,
					width: '13%'
				}),

				widgets.Text({
					db_fieldName: 'Last',
					label: get(LL).COLLECTION_TEST_Last(),
					icon: 'ri:t-box-line',
					placeholder: get(LL).COLLECTION_TEST_Last_placeholder(),
					required: true,
					width: '53%',
					localization: true,
					disabled: true
				})
			]
		}),

		widgets.Text({
			db_fieldName: 'Full Text option',
			label: get(LL).COLLECTION_TEST_Full_Text_Option(),
			icon: 'carbon:character-whole-number',
			prefix: 'EURO',
			suffix: 'cent',
			count: 10,
			minlength: 2,
			maxlength: 15,
			placeholder: get(LL).COLLECTION_TEST_Full_Text_Option_Placeholder(),
			localization: true,
			required: true
		}),

		widgets.Email({
			db_fieldName: 'Email',
			icon: 'carbon:character-whole-number',
			placeholder: 'Enter Email',
			required: true
		}),

		widgets.Number({
			db_fieldName: 'Number',
			label: 'Number label',
			icon: 'carbon:character-whole-number',
			placeholder: 'Enter Number from -9 to 99999',
			min: -9,
			max: 999999,
			step: 1,
			negative: true,
			required: false
		}),

		// widgets.Currency({
		// 	db_fieldName: 'Currency',
		// 	currencyCode: 'EUR',
		// 	label: 'Enter a currency',
		// 	icon: 'carbon:character-whole-number',
		// 	placeholder: 'Enter Currency from -99999.99 to 99999.99',
		// 	prefix: '€',
		// 	suffix: 'cent',
		// 	min: -99999.99,
		// 	max: 99999.99,
		// 	step: 0.001,
		// 	negative: true,
		// 	required: true
		// }),

		widgets.PhoneNumber({
			db_fieldName: 'Phone Number',
			label: 'Enter a phone number',
			icon: 'material-symbols:perm-phone-msg',
			placeholder: 'Enter Phone +4921513250033',
			required: true
		}),

		// TODO: show group in entry list table
		widgets.Group({
			db_fieldName: 'Test 2nd Group',
			label: 'Radio/Checkbox',
			condition: true,

			display: async (data: any, field: any, entry: any) => {
				return format([
					{
						label: 'Radio',
						text: entry.Radio,
						newLine: true // not working
					},
					{
						label: 'Checkbox',
						labelColor: 'blue',
						text: entry.Checkbox
					}
				]);
			},
			fields: [
				widgets.Radio({
					db_fieldName: 'Radio',
					label: 'Label for radio button',
					color: 'red',
					required: true,
					width: '50%'
				}),

				widgets.Checkbox({
					db_fieldName: 'Checkbox',
					label: 'Label for checkbox',
					color: 'green',
					width: '50%',
					required: true
				})
			]
		}),

		widgets.RichText({ db_fieldName: 'Description', label: 'Desc label' }),

		widgets.Address({ db_fieldName: 'Address', label: 'Address label working' }),

		widgets.Date({ db_fieldName: 'Date', label: 'Date label' }),

		// isseu with dayjs is this is actually required
		// widgets.DateRange({ title: 'DateRange' }),

		widgets.Url({
			db_fieldName: 'Url',
			label: 'Url label',
			icon: 'carbon:character-whole-number',
			placeholder: 'Enter Website',
			required: true,
			localization: true
		}),

		widgets.RemoteVideo({
			db_fieldName: 'remoteVideo',
			label: 'Remote Video Label',
			icon: 'bi:youtube',
			placeholder: 'Enter Video URL',
			required: true
		}),

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
