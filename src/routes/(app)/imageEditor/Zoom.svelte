<!-- Zoom.svelte -->
<script lang="ts">
	import Konva from 'konva';

	export let stage: Konva.Stage;
	export let layer: Konva.Layer;
	export let imageNode: Konva.Image;

	let scale = 1;

	function zoom(delta: number) {
		scale += delta;
		if (scale < 0.1) scale = 0.1;
		if (scale > 3) scale = 3;

		imageNode.scale({ x: scale, y: scale });
		layer.draw();
	}
</script>

<div>
	<button on:click={() => zoom(-0.1)}>Zoom Out</button>
	<span>{Math.round(scale * 100)}%</span>
	<button on:click={() => zoom(0.1)}>Zoom In</button>
</div>
