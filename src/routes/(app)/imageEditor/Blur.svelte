<!-- Blur.svelte -->
<script lang="ts">
	import Konva from 'konva';

	export let stage: Konva.Stage;
	export let layer: Konva.Layer;
	export let imageNode: Konva.Image;

	let blurAmount = 0;

	function applyBlur() {
		imageNode.cache();
		imageNode.filters([Konva.Filters.Blur]);
		imageNode.blurRadius(blurAmount);
		layer.draw();
	}
</script>

<div>
	<input type="range" min="0" max="40" bind:value={blurAmount} on:input={applyBlur} />
	<span>{blurAmount}</span>
</div>
