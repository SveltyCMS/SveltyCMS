import { mode } from '@src/stores/collection-store.svelte.ts';
import type { MediaImage } from '@utils/media/media-models';
import { meta_data } from '@utils/utils';

export const getWidgetData = async (
	_data: File | MediaImage | undefined,
	field: any,
	value: any
): Promise<File | MediaImage | { _id: string | undefined } | undefined> => {
	if (_data && _data instanceof File) {
		// Use the explicit folder if available, otherwise field.path
		(_data as any).path = field.folder || field.path;
	}

	if (value && !(value instanceof File) && _data && !(_data instanceof File) && _data?._id !== value?._id && value?._id && mode.value === 'edit') {
		meta_data.add('media_images_remove', [value._id.toString()]);
	}

	// Assuming validateInput is defined in MediaUpload.svelte and needs to be called there
	// This function only returns the data, not handles validation directly

	return _data || mode.value === 'create' ? _data : { _id: (value as MediaImage)?._id };
};
