<script lang="ts">
	let imageData: any; // Define a variable to hold the image data
</script>

<div class="mb-2 flex items-center">
	<!-- Display the image -->
	{#if imageData}
		<img src={imageData.thumbnail} alt={imageData.name} />
	{/if}
</div>
