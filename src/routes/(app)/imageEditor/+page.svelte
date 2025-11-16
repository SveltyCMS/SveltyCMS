<!--
@file: /src/routes/(app)/imageEditor/+page.svelte
@component
**Image editor page**
Simple wrapper for testing the ImageEditor component with various configurations.
This page serves as a demo and testing environment for the image editor.
-->

<script lang="ts">
	import { logger } from '@utils/logger';
	import { page } from '$app/state';
	import ImageEditor from './ImageEditor.svelte';

	// Get initial image from URL params if provided
	const initialImageSrc = $derived(page.params?.image || '');

	// Note: UIStore now handles pageheader/pagefooter visibility for image editor route
	// No need for manual onMount override

	// Handle save callback
	const handleSave = (dataURL: string, file: File) => {
		logger.debug('Image saved:', { dataURL, file });
		// TODO: Implement actual save logic (upload to media API, etc.)
		alert('Image saved successfully!');
	};

	// Handle cancel callback
	const handleCancel = () => {
		logger.debug('Edit canceled');
		// TODO: Implement navigation back or close modal
		alert('Edit canceled');
	};
</script>

<div class="flex h-full w-full flex-col overflow-hidden">
	<div class="flex flex-1 flex-col overflow-hidden">
		<ImageEditor {initialImageSrc} onSave={handleSave} onCancel={handleCancel} />
	</div>
</div>
