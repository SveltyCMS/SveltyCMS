/**
 * @file src/presets/ecommerce/customers.ts
 * @description Customer CRM schema for E-commerce preset.
 * @author SveltyCMS
 */

import type { Schema } from '@src/content/types';
import { widgets } from '@src/widgets/proxy';

const Customers: Schema = {
	name: 'Customers',
	slug: 'customers',
	icon: 'mdi:account-group',
	description: 'Customer CRM',
	fields: [
		widgets.Input({
			label: 'First Name',
			db_fieldName: 'first_name',
			required: true,
			width: 6
		}),
		widgets.Input({
			label: 'Last Name',
			db_fieldName: 'last_name',
			required: true,
			width: 6
		}),
		widgets.Input({
			label: 'Email',
			db_fieldName: 'email',
			required: true,
			unique: true,
			width: 6
		}),
		widgets.Input({
			label: 'Phone',
			db_fieldName: 'phone',
			width: 6
		}),
		widgets.Input({
			label: 'Address',
			db_fieldName: 'address',
			width: 12
		}),
		widgets.Repeater({
			label: 'Notes',
			db_fieldName: 'notes',
			fields: [widgets.Input({ label: 'Note', width: 12 }), widgets.Input({ label: 'Date', type: 'date', width: 12 })]
		})
	]
};

export default Customers;
