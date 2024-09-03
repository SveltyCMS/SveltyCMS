<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import Konva from 'konva';

	export let stage: Konva.Stage;
	export let layer: Konva.Layer;
	export let imageNode: Konva.Image;

	const dispatch = createEventDispatcher();

	// Rotate image left by 90 degrees
	function rotateLeft() {
		imageNode.rotate(-90);
		layer.draw();
		dispatch('rotate', { angle: -90 });
	}

	// Rotate image right by 90 degrees
	function rotateRight() {
		imageNode.rotate(90);
		layer.draw();
		dispatch('rotate', { angle: 90 });
	}
</script>

<div class="rotate-controls">
	<button on:click={rotateLeft} class="rotate-btn">
		<iconify-icon icon="mdi:rotate-left" width="24" class="text-white" />
		<p class="config-text">Rotate Left</p>
	</button>
	<button on:click={rotateRight} class="rotate-btn">
		<iconify-icon icon="mdi:rotate-right" width="24" class="text-white" />
		<p class="config-text">Rotate Right</p>
	</button>
</div>

<style>
	.rotate-controls {
		display: flex;
		gap: 10px;
	}
	.rotate-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 8px 16px;
		background-color: #4caf50;
		color: white;
		border: none;
		border-radius: 5px;
		cursor: pointer;
	}
	.rotate-btn:hover {
		background-color: #45a049;
	}
	.config-text {
		font-size: 12px;
		margin-top: 4px;
	}
</style>
