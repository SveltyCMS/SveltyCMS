<!--
@file src/widgets/core/MediaUpload/ModalImageEditor.svelte
@component
**MediaUpload Modal Image Editor**
This component renders the fully functional ImageEditor inside a modal,
allowing users to edit images directly from the MediaUpload widget.

### Props
- `_data`: The image data (File or MediaImage) to be edited.
- `onClose`: Callback function to close the modal.
- `mediaOnSelect`: Callback function to pass the edited image back to the parent.
-->
<script lang="ts">
	import ImageEditor from '@src/routes/(app)/imageEditor/ImageEditor.svelte';
	import type { MediaImage } from '@utils/media/mediaModels';

	// Props
	const {
		_data,
		onClose,
		mediaOnSelect
	}: {
		_data: File | MediaImage | undefined;
		onClose: () => void;
		mediaOnSelect: (file: File | MediaImage) => void;
	} = $props();

	// Determine the initial image source
	let imageFile: File | null = $state(null);
	let initialImageSrc: string = $state('');
	let mediaId: string | null = $state(null);

	if (_data) {
		if (_data instanceof File) {
			imageFile = _data;
		} else if ('thumbnails' in _data) {
			initialImageSrc = _data.thumbnails?.lg?.url || _data.url;
			// Attempt to capture media id
			mediaId = (_data as any)._id || (_data as any).id || null;
		}
	}

	function handleSave(_dataURL: string, file: File) {
		mediaOnSelect(file);
		onClose(); // Close the modal on save
	}

	function handleCancel() {
		onClose(); // Close the modal on cancel
	}
</script>

<div class="modal-content h-full max-h-none w-full max-w-none">
	<div class="flex h-full w-full flex-col">
		<ImageEditor {imageFile} {initialImageSrc} {mediaId} onSave={handleSave} onCancel={handleCancel} />
	</div>
</div>

<style>
	.modal-content {
		width: 95vw;
		height: 90vh;
		max-width: 1800px;
	}
</style>
