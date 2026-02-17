/**
 * @file src/presets/saas/Pricing.ts
 * @description SaaS pricing plans schema.
 * @author SveltyCMS
 */

import type { Schema } from '@src/content/types';
import { widgets } from '@src/widgets/proxy';

const Pricing: Schema = {
	name: 'Pricing',
	slug: 'pricing',
	icon: 'mdi:currency-usd',
	description: 'SaaS pricing plans',
	fields: [
		widgets.Input({
			label: 'Plan Name',
			db_fieldName: 'name',
			required: true,
			translated: true,
			width: 6
		}),
		widgets.Input({
			label: 'Badge / Tag',
			db_fieldName: 'badge',
			helper: 'e.g. Most Popular',
			width: 6
		}),
		widgets.Price({
			label: 'Monthly Price',
			db_fieldName: 'price_monthly',
			required: true,
			width: 6
		}),
		widgets.Price({
			label: 'Yearly Price',
			db_fieldName: 'price_yearly',
			required: true,
			width: 6
		}),
		widgets.Repeater({
			label: 'Features',
			db_fieldName: 'features',
			fields: [
				widgets.Input({ label: 'Feature Name', width: 12 }),
				widgets.Input({ label: 'Included', type: 'text', default: 'true', width: 12 }) // Boolean would be better but Input type check
			]
		})
	]
};

export default Pricing;
