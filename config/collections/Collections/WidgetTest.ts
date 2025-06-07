/**
 * @file config/collections/WidgetTest.ts
 * @description Collection file for WidgetTest
 */

import widgets from '@widgets';
import type { Schema } from '@root/src/content/types';

export const schema: Schema = {
	// Collection Name comming from filename, so not needed

	// Optional & Icon, status, slug
	// See for possible Icons https://icon-sets.iconify.design/
	icon: 'carbon:rule-test',

	// Defined Fields that are used in Collection
	// Widget fields can be inspected for individual options
	fields: [
		widgets.Input({
			label: 'First',
			db_fieldName: 'firstname',
			icon: 'ri:t-box-line',
			// placeholder: get(LL).COLLECTION_TEST_First_placeholder(),
			placeholder: 'Enter First Name',
			required: true,
			translated: true,
			width: 3
		}),

		widgets.Input({
			label: 'Middle',
			db_fieldName: 'middlename',
			icon: 'ri:t-box-line',
			placeholder: 'Enter Middle Name',
			readonly: true,
			width: 3
		}),

		widgets.Input({
			label: 'Last',
			db_fieldName: 'lastname',
			icon: 'ri:t-box-line',
			placeholder: 'Enter Last Name',
			width: 3,
			translated: true
		}),

		widgets.Input({
			label: 'Full Text option',
			db_fieldName: 'Full_Text_option',
			icon: 'carbon:character-whole-number',
			prefix: 'pre',
			suffix: 'suf',
			count: 10,
			minlength: 2,
			maxlength: 15,
			placeholder: 'Enter Full Text',
			translated: true,
			required: true
		}),

		widgets.Email({
			label: 'Email',
			db_fieldName: 'email',
			icon: 'material-symbols:mail-outline',
			placeholder: 'Enter Email',
			required: true
		}),

		widgets.RemoteVideo({
			label: 'RemoteVideo',
			db_fieldName: 'remotevideo',
			icon: 'mdi:youtube',
			placeholder: 'Enter RemoteVideo',
			required: true
		}),

		widgets.Date({
			label: 'Date',
			db_fieldName: 'date',
			icon: 'bi:calendar3',
			required: true
		}),

		widgets.DateTime({
			label: 'DateTime',
			db_fieldName: 'datetime',
			icon: 'bi:calendar3',
			required: true
		}),

		widgets.Number({
			label: 'Number',
			db_fieldName: 'number',
			icon: 'carbon:character-whole-number',
			placeholder: 'Enter Number',
			required: true,
			prefix: 'height',
			suffix: 'mm'
			// step: 0.01
		}),

		widgets.Currency({
			label: 'Currency',
			db_fieldName: 'currency',
			currencyCode: 'Euro',
			icon: 'carbon:character-whole-number',
			placeholder: 'Enter Currency',
			required: true,
			prefix: '€',
			suffix: 'Cent',
			step: 0.01
		}),

		widgets.PhoneNumber({
			label: 'Phone Number',
			db_fieldName: 'phonenumber',
			icon: 'ph:phone',
			placeholder: 'Enter Phone no',
			required: true
		}),

		widgets.Radio({
			label: 'Radio',
			db_fieldName: 'radio',
			icon: 'akar-icons:radio-fill',
			color: 'pink',
			required: true,
			width: 4
		}),

		widgets.Checkbox({
			label: 'Checkbox',
			db_fieldName: 'checkbox',
			icon: 'mdi:check-bold',
			color: 'pink',
			required: true,
			width: 4
		}),

		widgets.ColorPicker({
			label: 'ColorPicker',
			db_fieldName: 'colorpicker',
			icon: 'pepicons:color-picker',
			required: true,
			width: 4
		}),

		widgets.Rating({
			label: 'Rating',
			db_fieldName: 'rating',
			icon: 'material-symbols:star',
			maxRating: 7,
			color: 'pink',
			width: 4
		}),

		widgets.RichText({
			label: 'RichText',
			db_fieldName: 'RichText',
			icon: 'ri:t-box-line',
			required: true
		})

		// widgets.Seo({
		// 	label: 'Seo',
		// 	db_fieldName: 'seo',
		// 	icon: 'tabler:seo',
		// 	required: true
		// })
	]
};
