<script lang="ts">
	import { page } from '$app/stores';
	import ImageEditor from './ImageEditor.svelte';
	import PageTitle from '@components/PageTitle.svelte';

	// Get initial image from URL params if provided
	const initialImageSrc = $derived($page.params?.image || '');

	// Handle save callback
	const handleSave = (dataURL: string, file: File) => {
		console.log('Image saved:', { dataURL, file });
		// TODO: Implement actual save logic (upload to media API, etc.)
		alert('Image saved successfully!');
	};

	// Handle cancel callback
	const handleCancel = () => {
		console.log('Edit canceled');
		// TODO: Implement navigation back or close modal
		alert('Edit canceled');
	};
</script>

<PageTitle title="Image Editor" />

<div class="wrapper h-screen w-full">
	<div class="flex h-full w-full flex-col">
		<ImageEditor {initialImageSrc} onSave={handleSave} onCancel={handleCancel} />
	</div>
</div>
