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
	import { onMount, onDestroy } from 'svelte';
	import { toggleUIElement } from '@stores/UIStore.svelte';
	import ImageEditor from './ImageEditor.svelte';

	// Get initial image from URL params if provided
	const initialImageSrc = $derived(page.params?.image || '');

	// Show page header/footer when component mounts
	onMount(() => {
		toggleUIElement('pageheader', 'full');
		toggleUIElement('pagefooter', 'full');
	});

	// Hide page header/footer when component unmounts
	onDestroy(() => {
		toggleUIElement('pageheader', 'hidden');
		toggleUIElement('pagefooter', 'hidden');
	});

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
