<!--
@file src/widgets/core/mediaUpload/ModalImageEditor.svelte
@components
**MediaUpload modal Image Editor widget**

@example
<MediaUpload label="MediaUpload" db_fieldName="mediaUpload" required={true} />

### Props
- `field`: FieldType
- `value`: any

### Features
- Translatable
-->

<script lang="ts">
	import type { SvelteComponent } from 'svelte';
	import ImageEditor from '../../../routes/(app)/imageEditor/ImageEditor.svelte';

	// Stores
	import { getModalStore } from '@skeletonlabs/skeleton';
	import { meta_data, getFieldName } from '@utils/utils';
	import { mode } from '../../../stores/collectionStore.svelte';
	import type { MediaImage } from '@utils/media/mediaModels';
	import axios from 'axios';

	interface Props {
		/** Exposes parent props to this component. */
		parent: SvelteComponent;
		_data: File | MediaImage | undefined;
		field: any;
		updated: boolean;
		value: File | MediaImage | undefined;
		mediaOnSelect: (file: File | MediaImage) => void;
	}

	let { parent, _data, field, updated, value, mediaOnSelect }: Props = $props();

	const modalStore = getModalStore();
	let imageFile: File | null = $state(null);
	let initialImageSrc: string = $state('');

	// Load image data when component mounts
	$effect(() => {
		if (_data instanceof File) {
			imageFile = _data;
		} else if (_data && 'path' in _data) {
			initialImageSrc = _data.path;
		} else if (value instanceof File) {
			imageFile = value;
		} else if (value && 'path' in value) {
			initialImageSrc = value.path;
		}
	});

	// Handle save from image editor
	function handleSave(dataURL: string, file: File) {
		// Update the parent component with the edited file
		mediaOnSelect(file);

		// If we're in edit mode and there was an original image, mark it for removal
		if (mode.value === 'edit' && value && '_id' in value) {
			meta_data.add('media_images_remove', [value._id.toString()]);
		}

		// Close the modal
		modalStore.close();
	}

	// Handle cancel from image editor
	function handleCancel() {
		// Just close the modal without saving
		modalStore.close();
	}
</script>

<!-- Modal with Image Editor -->
<div class="bg-surface-100-800-token flex h-screen w-screen items-center justify-center p-4">
	<div class="h-full max-h-[90vh] w-full max-w-7xl overflow-hidden rounded-lg bg-surface-50 shadow-xl dark:bg-surface-900">
		<ImageEditor {imageFile} {initialImageSrc} onSave={handleSave} onCancel={handleCancel} />
	</div>
</div>
