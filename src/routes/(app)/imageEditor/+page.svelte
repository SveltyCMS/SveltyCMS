<!--
@file: /src/routes/(app)/imageEditor/+page.svelte
@component
**Image editor test page**
Simple wrapper for testing the ImageEditor component with various configurations.
This page serves as a demo and testing environment for the image editor.
-->

<script lang="ts">
	import { page } from '$app/stores';
	import ImageEditor from './ImageEditor.svelte';
	import PageTitle from '@components/PageTitle.svelte';

	// Get initial image from URL params if provided
	const initialImage = $derived($page.params?.image || '');

	// Handle save callback
	function handleSave(dataURL: string, file: File) {
		console.log('Image saved:', { dataURL, file });
		// TODO: Implement actual save logic (upload to media API, etc.)
		alert('Image saved successfully!');
	}

	// Handle cancel callback
	function handleCancel() {
		console.log('Edit canceled');
		// TODO: Implement navigation back or close modal
		alert('Edit canceled');
	}
</script>

<PageTitle title="Image Editor" />

<div class="wrapper h-screen w-full">
	<div class="flex h-full w-full flex-col">
		<ImageEditor initialImageSrc={initialImage} onSave={handleSave} onCancel={handleCancel} />
	</div>
</div>
