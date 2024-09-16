/**
 * @file src/collections/Media.ts
 * @description Collection file for Media
 */

import widgets from '@components/widgets';
import type { Schema } from '@src/collections/types';

export const schema: Schema = {
	// Collection Name comming from filename
	// Optional & Icon, status, slug
	// See for possible Icons https://icon-sets.iconify.design/
	icon: 'pajamas:media',

	// Defined Fields that are used in Collection
	// Widget fields can be inspected for individual options
	fields: [
		widgets.ImageUpload({
			label: 'Image',
			folder: 'global'
		})
	]
};
