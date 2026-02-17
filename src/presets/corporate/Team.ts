/**
 * @file src/presets/corporate/Team.ts
 * @description Corporate team members schema.
 * @author SveltyCMS
 */

import type { Schema } from '@src/content/types';
import { widgets } from '@src/widgets/proxy';

const Team: Schema = {
	name: 'Team',
	slug: 'team',
	icon: 'mdi:account-group-outline',
	description: 'Team members and leadership',
	fields: [
		widgets.Input({
			label: 'Full Name',
			db_fieldName: 'name',
			required: true,
			width: 6
		}),
		widgets.Input({
			label: 'Job Title',
			db_fieldName: 'role',
			required: true,
			translated: true,
			width: 6
		}),
		widgets.Input({
			label: 'Bio',
			db_fieldName: 'bio',
			translated: true,
			width: 12
		}),
		widgets.Input({
			label: 'Photo URL',
			db_fieldName: 'photo',
			width: 6
		}),
		widgets.Input({
			label: 'LinkedIn URL',
			db_fieldName: 'linkedin',
			width: 6
		})
	]
};

export default Team;
