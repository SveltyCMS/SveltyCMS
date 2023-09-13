<script lang="ts">
	import Cropper from '@src/components/Cropper.svelte';
	import PageTitle from '@src/components/PageTitle.svelte';
	// Import necessary dependencies
	import { onMount } from 'svelte';

	// Define a variable to store the uploaded image
	let uploadedImage: string | ArrayBuffer | null = null;

	// Function to handle image upload
	function handleImageUpload(event) {
		const file = event.target.files[0];
		const reader = new FileReader();

		reader.onload = () => {
			uploadedImage = reader.result;
		};

		reader.readAsDataURL(file);
	}

	// Function to handle form submission (optional)
	function handleSubmit(event) {
		event.preventDefault();
		// Add logic for form submission if needed
	}
</script>

<div class="flex flex-col gap-1">
	<PageTitle name="Media Gallery" icon="bi:images" iconColor="text-primary-500" />

	<!-- Input for image upload -->
	<input type="file" accept="image/*" on:change={handleImageUpload} />

	<!-- Display the uploaded image -->
	{#if typeof uploadedImage === 'string'}
		<img src={uploadedImage} alt="Product Name" />
	{:else if uploadedImage instanceof ArrayBuffer}
		<img src="" alt="Uploaded Image" /> <!-- Provide a meaningful alt text -->
	{/if}

	<!-- Include the Cropper component -->
	{#if typeof uploadedImage === 'string'}
		<Cropper image={uploadedImage} /><!-- Pass the uploaded image to the Cropper component -->
	{/if}

	<!-- Optional: Add a form to handle submission -->
	<!-- <form on:submit="{handleSubmit}">
      ... add form fields and submit button ...
    </form> -->
</div>
