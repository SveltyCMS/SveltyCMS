<!-- TextOverlay.svelte -->
<script lang="ts">
	import Konva from 'konva';

	export let stage: Konva.Stage;
	export let layer: Konva.Layer;

	let text = '';
	let fontSize = 24;
	let textColor = '#ffffff';

	function addText() {
		const textNode = new Konva.Text({
			x: 50,
			y: 50,
			text: text,
			fontSize: fontSize,
			fill: textColor,
			draggable: true
		});
		layer.add(textNode);
		layer.draw();
	}
</script>

<div>
	<input type="text" bind:value={text} placeholder="Enter text" />
	<input type="number" bind:value={fontSize} min="8" max="72" />
	<input type="color" bind:value={textColor} />
	<button on:click={addText}>Add Text</button>
</div>
