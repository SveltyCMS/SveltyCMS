/**
 * @file src/presets/ecommerce/product-variants.ts
 * @description Product variants and stock management schema.
 * @author SveltyCMS
 */

import type { Schema } from '@src/content/types';
import { widgets } from '@src/widgets/proxy';

const ProductVariants: Schema = {
	name: 'ProductVariants',
	slug: 'product_variants',
	icon: 'mdi:barcode',
	description: 'Manage product SKUs and stock levels',
	fields: [
		widgets.Input({
			label: 'Variant Name',
			db_fieldName: 'name',
			required: true,
			width: 6,
			helper: 'e.g. Size L, Red'
		}),
		widgets.Input({
			label: 'SKU',
			db_fieldName: 'sku',
			required: true,
			unique: true,
			width: 6
		}),
		widgets.Relation({
			label: 'Product',
			db_fieldName: 'product',
			relation: 'Products',
			required: true,
			display: ({ data }: { data: any }) => data?.title || 'Unknown Product',
			width: 6
		}),
		widgets.Price({
			label: 'Variant Price',
			db_fieldName: 'price',
			required: false,
			width: 6,
			helper: 'Override base product price'
		}),
		widgets.Input({
			label: 'Stock Quantity',
			db_fieldName: 'stock',
			type: 'number',
			required: true,
			default: 0,
			width: 4
		}),
		widgets.Input({
			label: 'Weight (kg)',
			db_fieldName: 'weight',
			type: 'number',
			width: 4
		})
	]
};

export default ProductVariants;
