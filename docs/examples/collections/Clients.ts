/**
 * @file config/collections/Collections/Clients.ts
 * @description Collection for managing clients with hourly rates
 */

import type { Schema } from '@cms/content/types';
import { widgets } from '@cms/widgets/proxy';

export const schema: Schema = {
	icon: 'mdi:account-group',
	status: 'publish',
	slug: 'clients',
	description: 'Client management with negotiated hourly rates',
	revision: true,

	fields: [
		widgets.Input({
			label: 'Client Name',
			db_fieldName: 'clientName',
			required: true,
			translated: false,
			icon: 'mdi:account',
			placeholder: 'Enter client name',
			helper: 'Full name or company name of the client'
		}),

		widgets.Email({
			label: 'Email',
			db_fieldName: 'email',
			required: true,
			icon: 'material-symbols:mail',
			placeholder: 'client@example.com',
			helper: 'Primary contact email for the client'
		}),

		widgets.PhoneNumber({
			label: 'Phone Number',
			db_fieldName: 'phoneNumber',
			required: false,
			icon: 'mdi:phone',
			placeholder: '+1 (555) 123-4567',
			helper: 'Contact phone number'
		}),

		widgets.Currency({
			label: 'Hourly Rate',
			db_fieldName: 'hourlyRate',
			required: true,
			currencyCode: 'USD',
			minValue: 0,
			icon: 'mdi:currency-usd',
			placeholder: '150.00',
			helper: 'Negotiated hourly rate for this client'
		}),

		widgets.Input({
			label: 'Company',
			db_fieldName: 'company',
			required: false,
			translated: false,
			icon: 'mdi:office-building',
			placeholder: 'Company name',
			helper: 'Client company or organization name'
		}),

		widgets.Address({
			label: 'Address',
			db_fieldName: 'address',
			required: false,
			icon: 'mdi:map-marker',
			helper: 'Client billing address'
		}),

		widgets.RichText({
			label: 'Notes',
			db_fieldName: 'notes',
			required: false,
			translated: false,
			icon: 'mdi:note-text',
			helper: 'Additional notes about the client, contract terms, preferences, etc.'
		})
	]
};
