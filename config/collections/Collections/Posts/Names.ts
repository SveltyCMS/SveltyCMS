/**
 * @file config/collections/Collections/Posts/Names.ts
 * @description Collection file for Names
 */

import { widgets } from '@src/widgets/proxy';
import type { Schema } from '@root/src/content/types';

export const schema: Schema = {
	// Collection Name comming from filename, so not needed
	// Optional & Icon, status, slug
	// See for possible Icons https://icon-sets.iconify.design/
	icon: 'fluent:rename-28-filled',
	description: 'Scoped Names collection to test UUID collision with same filenames',
	status: 'unpublish',
	revision: true,
	livePreview: '/api/preview?slug=/posts/names/{slug}',

	// Defined Fields that are used in your Collection
	// Widget fields can be inspected for individual options
	fields: [
		widgets.Input({
			label: 'First Name',
			translated: true,
			icon: 'ri:t-box-line',
			placeholder: 'Enter First Name',
			width: 2
		}),

		widgets.Select({
			label: 'Role',
			db_fieldName: 'role',
			icon: 'fluent:person-key-20-filled',
			options: ['Author', 'Editor', 'Contributor', 'Guest'],
			default: 'Contributor',
			width: 2
		}),
		widgets.MediaUpload({
			label: 'Avatar',
			db_fieldName: 'avatar',
			icon: 'fluent:person-circle-24-filled',
			folder: 'avatars',
			multiupload: false
		})
	]
};
