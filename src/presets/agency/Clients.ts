/**
 * @file src/presets/agency/Clients.ts
 * @description Agency clients schema.
 * @author SveltyCMS
 */

import type { Schema } from '@src/content/types';
import { widgets } from '@src/widgets/proxy';

const Clients: Schema = {
	name: 'Clients',
	slug: 'clients',
	icon: 'mdi:domain',
	description: 'Client list',
	fields: [
		widgets.Input({
			label: 'Client Name',
			db_fieldName: 'name',
			required: true,
			width: 6
		}),
		widgets.Input({
			label: 'Website',
			db_fieldName: 'website',
			width: 6
		}),
		// Ideally Image widget here
		widgets.Input({
			label: 'Logo URL',
			db_fieldName: 'logo',
			width: 12
		})
	]
};

export default Clients;
