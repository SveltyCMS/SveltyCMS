/**
 * @file src/presets/ecommerce/products.ts
 * @description Product catalog schema for E-commerce preset.
 * @author SveltyCMS
 */

import type { Schema } from '@src/content/types';
import { widgets } from '@src/widgets/proxy';

const Products: Schema = {
	name: 'Products',
	slug: 'products',
	icon: 'mdi:tag',
	description: 'Manage your product catalog',
	fields: [
		widgets.Input({
			label: 'Product Title',
			db_fieldName: 'title',
			required: true,
			translated: true,
			width: 6
		}),
		widgets.Input({
			label: 'Slug',
			db_fieldName: 'slug',
			required: true,
			width: 6
			// helper: 'URL friendly identifier'
		}),
		widgets.RichText({
			label: 'Description',
			db_fieldName: 'description',
			translated: true,
			width: 12
		}),
		widgets.Price({
			label: 'Price',
			db_fieldName: 'price',
			required: true,
			width: 6
		}),
		widgets.Input({
			label: 'SKU',
			db_fieldName: 'sku',
			required: true,
			width: 6
		}),
		// Repeater for Product Attributes
		widgets.Repeater({
			label: 'Attributes',
			db_fieldName: 'attributes',
			addLabel: 'Add Attribute',
			fields: [widgets.Input({ label: 'Name', required: true, width: 6 }), widgets.Input({ label: 'Value', required: true, width: 6 })]
		}),
		widgets.Seo({
			label: 'SEO Settings',
			db_fieldName: 'seo',
			width: 12
		})
	]
};

export default Products;
