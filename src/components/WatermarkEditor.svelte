<script lang="ts">
	import WatermarkSelector from './WatermarkSelector.svelte';
	import WatermarkSettings from './WatermarkSettings.svelte';

	export let mediaItems = [];
	let selectedMedia = null;
	let size = '100%';
	let opacity = 1;
	let positionX = 0;
	let positionY = 0;
	let rotation = 0;

	function handleMediaSelect(media) {
		selectedMedia = media;
	}
</script>

<div class="watermark-editor">
	<h2>Select Watermark Image</h2>
	<WatermarkSelector {mediaItems} {selectedMedia} onSelect={handleMediaSelect} />

	{#if selectedMedia}
		<h2>Adjust Watermark Settings</h2>
		<WatermarkSettings bind:size bind:opacity bind:positionX bind:positionY bind:rotation />
		<div class="preview">
			<h2>Preview</h2>
			<div
				class="watermark-preview"
				style="background-image: url({selectedMedia.url}); opacity: {opacity}; transform: scale({size}) translate({positionX}px, {positionY}px) rotate({rotation}deg);"
			></div>
		</div>
	{/if}
</div>

<style>
	.watermark-editor {
		padding: 20px;
	}
	.preview {
		margin-top: 20px;
	}
	.watermark-preview {
		width: 100%;
		height: 200px;
		background-size: contain;
		background-repeat: no-repeat;
		background-position: center;
		border: 1px solid #ccc;
	}
</style>
