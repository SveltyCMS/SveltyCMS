/**
 * @file src/presets/blog/authors.ts
 * @description Blog authors schema.
 * @author SveltyCMS
 */

import type { Schema } from '@src/content/types';
import { widgets } from '@src/widgets/proxy';

const Authors: Schema = {
	name: 'Authors',
	slug: 'authors',
	icon: 'mdi:account-tie',
	description: 'Blog authors',
	fields: [
		widgets.Input({
			label: 'Name',
			db_fieldName: 'name',
			required: true,
			width: 6
		}),
		widgets.Input({
			label: 'Email',
			db_fieldName: 'email',
			required: true,
			width: 6
		}),
		widgets.Input({
			label: 'Bio',
			db_fieldName: 'bio',
			translated: true,
			width: 12
		}),
		// Ideally specialized Image widget here, using Input for now if Media not fully ready or complex
		widgets.Input({
			label: 'Avatar URL',
			db_fieldName: 'avatar',
			width: 12
		})
	]
};

export default Authors;
