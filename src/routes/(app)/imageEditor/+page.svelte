<script lang="ts">
	// Stores
	import { mode, saveEditedImage } from '@stores/store';
	import { page } from '$app/stores';

	import { onMount } from 'svelte';

	import PageTitle from '@components/PageTitle.svelte';
	import Cropper from '@src/routes/(app)/imageEditor/Cropper.svelte';
	import ImageEditor from '@src/routes/(app)/imageEditor/ImageEditor.svelte';

	import { goto } from '$app/navigation';

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

	// function to undo the changes made by handleButtonClick
	function handleCancel() {
		mode.set('view');
		goto('/');
	}
</script>

<div class="my-2 flex items-center justify-between">
	<PageTitle name="Image Editor" icon="tdesign:image-edit" />

	<!-- buttons -->
	<div class="mb-2 flex items-center gap-2">
		<!-- Save Content -->
		{#if image}
			<button type="button" on:click={handleSave} class="variant-filled-tertiary btn-icon dark:variant-filled-primary md:hidden">
				<iconify-icon icon="material-symbols:save" width="24" class="text-white" />
			</button>
			<!-- button hack  -->
			<button type="button" on:click={handleSave} class="variant-filled-tertiary btn hidden dark:variant-filled-primary md:inline-flex">
				<iconify-icon icon="material-symbols:save" width="24" class="text-white" />
				<p class="hidden md:block">Save</p>
			</button>
		{/if}

		<!-- Cancel -->
		<button type="button" on:click={handleCancel} class="variant-ghost-surface btn-icon">
			<iconify-icon icon="material-symbols:close" width="24" />
		</button>
	</div>
</div>

<input class="input my-2" type="file" accept="image/*" on:change={handleImageUpload} />

{#if image}
	<div class="wrapper mb-2">
		<!-- <div class="wrapper max-h-[calc(100vh-200px)] bg-emerald-400"> -->
		<!-- old Image Editor -->
		<!-- <Cropper bind:image /> -->

		<!-- New Image Editor -->
		<ImageEditor bind:image />
	</div>
{:else if selectedImage}
	<img src={selectedImage} alt="" />
{/if}

{#if $saveEditedImage}
	<div class="success-message">Image saved successfully!</div>
{/if}
