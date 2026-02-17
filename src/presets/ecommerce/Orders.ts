/**
 * @file src/presets/ecommerce/Orders.ts
 * @description Order management schema for E-commerce preset.
 * @author SveltyCMS
 */

import type { Schema } from '@src/content/types';
import { widgets } from '@src/widgets/proxy';

const Orders: Schema = {
	name: 'Orders',
	slug: 'orders',
	icon: 'mdi:cart',
	description: 'Manage customer orders',
	strict: true, // Lock schema for orders to prevent accidental changes
	fields: [
		widgets.Input({
			label: 'Order ID',
			db_fieldName: 'order_id',
			required: true,
			unique: true,
			readonly: true,
			width: 4
		}),
		widgets.Input({
			label: 'Status',
			db_fieldName: 'status', // In real app, this should be a Select widget with fixed options
			required: true,
			default: 'pending',
			width: 4
		}),
		widgets.Relation({
			label: 'Customer',
			db_fieldName: 'customer',
			relation: 'Customers',
			display: ({ data }: { data: any }) => `${data?.first_name} ${data?.last_name}`,
			width: 4
		}),
		widgets.Price({
			label: 'Total Amount',
			db_fieldName: 'total',
			required: true,
			readonly: true,
			width: 6
		}),
		widgets.Repeater({
			label: 'Order Items',
			db_fieldName: 'items',
			fields: [
				widgets.Relation({
					label: 'Product Variant',
					relation: 'ProductVariants',
					required: true,
					display: ({ data }: { data: any }) => data?.sku
				}),
				widgets.Input({
					label: 'Quantity',
					type: 'number',
					required: true,
					default: 1
				}),
				widgets.Price({
					label: 'Unit Price',
					required: true,
					readonly: true
				})
			]
		})
	]
};

export default Orders;
