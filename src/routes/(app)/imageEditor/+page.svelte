<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import PageTitle from '@components/PageTitle.svelte';
	import Cropper from '@src/routes/(app)/imageEditor/Cropper.svelte';
	import ImageEditor from '@src/routes/(app)/imageEditor/ImageEditor.svelte';

	import { saveEditedImage } from '@stores/store';

	let image: File | null | undefined; // Add undefined as a possible type
	let selectedImage: string;

	onMount(async () => {
		const { params } = $page;
		selectedImage = params.image;
	});

	const handleImageUpload = (event: Event) => {
		const target = event.target as HTMLInputElement;
		if (target === null || target.files === null) return;

		image = target.files[0] as File; // Explicitly cast to File
		if (!image) return;
	};

	const handleSave = () => {
		// Convert the canvas to a blob
		// const canvas = document.querySelector('canvas') as HTMLCanvasElement;
		// canvas.toBlob((blob) => {
		// 	// Create a new file object
		// 	const file = new File([blob ?? new Blob()], image!.name, { type: image!.type });
		// 	// Update the file store with the new file
		// 	file.update(file);
		// 	// Update the saveEditedImage store to true
		// 	saveEditedImage.update((old) => true);
		// });
	};
</script>

<div class="mb-2 flex items-center justify-between">
	<PageTitle name="Image Editor" icon="" />

	{#if image}
		<button type="button" on:click={handleSave} class="variant-filled-primary btn gap-2 !text-white">
			<iconify-icon icon="material-symbols:save" width="24" class="text-white" />
			Save
		</button>
	{/if}
</div>

<input class="input my-4" type="file" accept="image/*" on:change={handleImageUpload} />

{#if image}
	<!-- old Image Editor -->
	<Cropper bind:image />

	<!-- New Image Editor -->
	<ImageEditor bind:image />
{:else if selectedImage}
	<img src={selectedImage} alt="" />
{/if}

{#if $saveEditedImage}
	<div class="success-message">Image saved successfully!</div>
{/if}
