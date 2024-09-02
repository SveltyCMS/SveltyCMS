<script lang="ts">
	import { onMount } from 'svelte';
	import { mode, saveEditedImage } from '@stores/store';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import PageTitle from '@components/PageTitle.svelte';
	import ImageEditor from '@src/routes/(app)/imageEditor/ImageEditor.svelte';

	let imageFile: File | null = null;
	let selectedImage: string;
	let imageEditorRef: ImageEditor;

	onMount(async () => {
		const { params } = $page;
		selectedImage = params.image;
	});

	const handleImageUpload = (event: Event) => {
		const target = event.target as HTMLInputElement;
		if (target === null || target.files === null) return;

		imageFile = target.files[0];
	};

	const handleSave = async () => {
		if (imageEditorRef) {
			const updatedImageFile = await imageEditorRef.getEditedImage();
			if (updatedImageFile) {
				// Update the file store with the new file
				// file.update(updatedImageFile);
				// Update the saveEditedImage store to true
				saveEditedImage.set(true);
				// You might want to handle the saved image (e.g., upload to server)
				console.log('Image saved:', updatedImageFile);
			}
		}
	};

	function handleCancel() {
		mode.set('view');
		goto('/');
	}
</script>

<div class="my-2 flex items-center justify-between gap-2">
	<!-- Page Title -->
	<div class="flex items-center">
		<PageTitle name="Image Editor" icon="tdesign:image-edit" />
	</div>

	<!-- Back Button -->
	<button on:click={() => history.back()} class="variant-outline-primary btn-icon">
		<iconify-icon icon="ri:arrow-left-line" width="20" />
	</button>
</div>

<div class="mb-2 flex items-center justify-between gap-2">
	{#if imageFile}
		<button type="button" on:click={handleSave} class="variant-filled-tertiary btn-icon dark:variant-filled-primary md:hidden">
			<iconify-icon icon="material-symbols:save" width="24" class="text-white" />
		</button>
		<button type="button" on:click={handleSave} class="variant-filled-tertiary btn hidden dark:variant-filled-primary md:inline-flex">
			<iconify-icon icon="material-symbols:save" width="24" class="text-white" />
			<p class="hidden md:block">Save</p>
		</button>
	{/if}

	<button type="button" on:click={handleCancel} class="variant-ghost-surface btn-icon">
		<iconify-icon icon="material-symbols:close" width="24" />
	</button>
</div>

<input class="input my-2" type="file" accept="image/*" on:change={handleImageUpload} />

{#if imageFile}
	<div class="wrapper mb-2">
		<ImageEditor bind:imageFile bind:this={imageEditorRef} />
	</div>
{:else if selectedImage}
	<img src={selectedImage} alt="" />
{/if}

{#if $saveEditedImage}
	<div class="success-message">Image saved successfully!</div>
{/if}
