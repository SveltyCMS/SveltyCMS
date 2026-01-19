/**
 * @file config/collections/Collections/Invoices.ts
 * @description Collection for managing invoices for completed tasks
 */

import type { Schema } from '@cms/content/types';
import { widgets } from '@cms/widgets/proxy';

export const schema: Schema = {
	icon: 'mdi:file-document-outline',
	status: 'publish',
	slug: 'invoices',
	description: 'Invoice management for billing clients for completed work',
	revision: true,

	fields: [
		widgets.Input({
			label: 'Invoice Number',
			db_fieldName: 'invoiceNumber',
			required: true,
			translated: false,
			unique: true,
			icon: 'mdi:numeric',
			placeholder: 'INV-2024-001',
			helper: 'Unique invoice number for tracking'
		}),

		widgets.Relation({
			label: 'Client',
			db_fieldName: 'clientId',
			required: true,
			collection: 'Clients',
			displayField: 'clientName',
			icon: 'mdi:account',
			helper: 'Client to be billed'
		}),

		widgets.Date({
			label: 'Invoice Date',
			db_fieldName: 'invoiceDate',
			required: true,
			icon: 'mdi:calendar',
			helper: 'Date when invoice was issued'
		}),

		widgets.Date({
			label: 'Due Date',
			db_fieldName: 'dueDate',
			required: true,
			icon: 'mdi:calendar-clock',
			helper: 'Payment due date'
		}),

		widgets.Currency({
			label: 'Total Amount',
			db_fieldName: 'totalAmount',
			required: true,
			currencyCode: 'USD',
			minValue: 0,
			icon: 'mdi:currency-usd',
			placeholder: '5400.00',
			helper: 'Total invoice amount (sum of all task costs)'
		}),

		widgets.Radio({
			label: 'Payment Status',
			db_fieldName: 'paymentStatus',
			required: true,
			icon: 'mdi:credit-card',
			legend: 'Current payment status',
			options: [
				{ label: 'Draft', value: 'draft' },
				{ label: 'Sent', value: 'sent' },
				{ label: 'Paid', value: 'paid' },
				{ label: 'Overdue', value: 'overdue' },
				{ label: 'Cancelled', value: 'cancelled' }
			],
			helper: 'Current status of this invoice'
		}),

		widgets.Date({
			label: 'Payment Date',
			db_fieldName: 'paymentDate',
			required: false,
			icon: 'mdi:calendar-check',
			helper: 'Date when payment was received'
		}),

		widgets.Input({
			label: 'Payment Method',
			db_fieldName: 'paymentMethod',
			required: false,
			translated: false,
			icon: 'mdi:payment',
			placeholder: 'Wire Transfer, Credit Card, etc.',
			helper: 'Method used for payment'
		}),

		widgets.Input({
			label: 'Payment Reference',
			db_fieldName: 'paymentReference',
			required: false,
			translated: false,
			icon: 'mdi:tag',
			placeholder: 'Transaction ID or Reference',
			helper: 'Payment transaction reference or ID'
		}),

		widgets.RichText({
			label: 'Line Items',
			db_fieldName: 'lineItems',
			required: true,
			translated: false,
			icon: 'mdi:format-list-bulleted',
			helper: 'Detailed list of tasks included in this invoice (can be formatted as a table)'
		}),

		widgets.RichText({
			label: 'Notes',
			db_fieldName: 'notes',
			required: false,
			translated: false,
			icon: 'mdi:note-text',
			helper: 'Additional notes, payment terms, or instructions for the client'
		}),

		widgets.Input({
			label: 'Tax Rate (%)',
			db_fieldName: 'taxRate',
			required: false,
			translated: false,
			icon: 'mdi:percent',
			placeholder: '0',
			helper: 'Tax rate percentage if applicable'
		}),

		widgets.Currency({
			label: 'Tax Amount',
			db_fieldName: 'taxAmount',
			required: false,
			currencyCode: 'USD',
			minValue: 0,
			icon: 'mdi:currency-usd',
			placeholder: '0.00',
			helper: 'Calculated tax amount'
		}),

		widgets.Currency({
			label: 'Subtotal',
			db_fieldName: 'subtotal',
			required: false,
			currencyCode: 'USD',
			minValue: 0,
			icon: 'mdi:currency-usd',
			placeholder: '5400.00',
			helper: 'Subtotal before tax'
		})
	]
};
