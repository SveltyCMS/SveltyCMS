/**
 * @file src/presets/corporate/Locations.ts
 * @description Corporate office locations schema.
 * @author SveltyCMS
 */

import type { Schema } from '@src/content/types';
import { widgets } from '@src/widgets/proxy';

const Locations: Schema = {
	name: 'Locations',
	slug: 'locations',
	icon: 'mdi:map-marker-radius',
	description: 'Office locations',
	fields: [
		widgets.Input({
			label: 'Office Name',
			db_fieldName: 'name',
			required: true,
			width: 12
		}),
		widgets.Input({
			label: 'Address',
			db_fieldName: 'address',
			width: 12
		}),
		widgets.Input({
			label: 'City',
			db_fieldName: 'city',
			width: 6
		}),
		widgets.Input({
			label: 'Country',
			db_fieldName: 'country',
			width: 6
		}),
		widgets.Input({
			label: 'Coordinates',
			db_fieldName: 'coordinates',
			helper: 'Lat, Lng',
			width: 6
		}),
		widgets.Input({
			label: 'Phone',
			db_fieldName: 'phone',
			width: 6
		})
	]
};

export default Locations;
