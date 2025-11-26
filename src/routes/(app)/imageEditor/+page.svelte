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
	import { setRouteContext } from '@stores/UIStore.svelte';
	import ImageEditor from './ImageEditor.svelte';

	// Get initial image from URL params if provided
	const initialImageSrc = $derived(page.params?.image || '');

	// Update route context to trigger UIStore layout changes (hides sidebars, shows full header/footer)
	onMount(() => {
		setRouteContext({ isImageEditor: true });
	});

	// Reset route context when component unmounts
	onDestroy(() => {
		setRouteContext({ isImageEditor: false });
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
