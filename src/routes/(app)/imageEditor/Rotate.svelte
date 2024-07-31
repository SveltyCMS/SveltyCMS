<!-- Rotate.svelte -->
<script lang="ts">
	import Konva from 'konva';

	export let stage: Konva.Stage;
	export let layer: Konva.Layer;
	export let imageNode: Konva.Image;

	function rotate(degrees: number) {
		imageNode.rotate(degrees);
		layer.draw();
	}
</script>

<div>
	<button on:click={() => rotate(-90)}>Rotate Left</button>
	<button on:click={() => rotate(90)}>Rotate Right</button>
</div>
