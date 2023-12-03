import { redirect } from '@sveltejs/kit';
import widgets from '@src/components/widgets';
import { roles } from './types';
import type { Schema } from './types';

// typesafe-i18n
// import LL from '@src/i18n/i18n-svelte';
// import { get } from 'svelte/store';

const schema: Schema = {
	// Collection Name comming from filename

	// Optional & Icon, status, slug
	// See for possible Icons https://icon-sets.iconify.design/
	icon: 'carbon:rule-test',

	// Collection Permissions by user Roles
	permissions: {
		[roles.user]: {
			read: false
		}
	},

	// Defined Fields that are used in Collection
	// Widget fields can be inspected for individual options
	fields: [
		widgets.Text({
			db_fieldName: 'firstname',
			// label: get(LL).COLLECTION_TEST_First(),
			label: 'First',
			icon: 'ri:t-box-line',
			// placeholder: get(LL).COLLECTION_TEST_First_placeholder(),
			placeholder: 'Enter First Name',
			required: true,
			translated: true,
			width: 3
		}),

		widgets.Text({
			db_fieldName: 'middlename',
			// label: get(LL).COLLECTION_TEST_Middle(),
			label: 'Middle',
			icon: 'ri:t-box-line',
			// placeholder: get(LL).COLLECTION_TEST_Middle_placeholder(),
			placeholder: 'Enter Middle Name',
			readonly: true,
			width: 3
		}),

		widgets.Text({
			db_fieldName: 'lastname',
			// label: get(LL).COLLECTION_TEST_Last(),
			label: 'Last',
			icon: 'ri:t-box-line',
			// placeholder: get(LL).COLLECTION_TEST_Last_placeholder(),
			placeholder: 'Enter Last Name',
			width: 3,
			translated: true,
			disabled: true
		}),

		widgets.Text({
			db_fieldName: 'Full_Text_option',
			// label: get(LL).COLLECTION_TEST_Full_Text_Option(),
			label: 'Full Text option',
			icon: 'carbon:character-whole-number',
			prefix: 'pre',
			suffix: 'suf',
			count: 10,
			minlength: 2,
			maxlength: 15,
			// placeholder: get(LL).COLLECTION_TEST_Full_Text_Option_Placeholder(),
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

		widgets.ColorPicker({
			label: 'ColorPicker',
			db_fieldName: 'colorpicker',
			icon: 'bi:calendar3',
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
			required: true
		}),

		widgets.Checkbox({
			label: 'Checkbox',
			db_fieldName: 'checkbox',
			icon: 'mdi:check-bold',
			color: 'pink',
			required: true
		}),

		// widgets.RichText({
		// 	label: 'RichText',
		// 	db_fieldName: 'RichText',
		// 	icon: 'ri:t-box-line',
		// 	required: true
		// }),

		widgets.Seo({
			label: 'Seo',
			db_fieldName: 'seo',
			icon: 'tabler:seo',
			required: true
		})
	]
};
export default schema;
