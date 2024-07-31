<!-- Resize.svelte -->
<script lang="ts">
	import Konva from 'konva';

	export let stage: Konva.Stage;
	export let layer: Konva.Layer;
	export let imageNode: Konva.Image;

	let width = imageNode.width();
	let height = imageNode.height();
	let maintainAspectRatio = true;

	function resize() {
		imageNode.width(width);
		imageNode.height(height);
		layer.draw();
	}

	function updateDimensions(changedDimension: 'width' | 'height') {
		if (maintainAspectRatio) {
			const aspectRatio = imageNode.width() / imageNode.height();
			if (changedDimension === 'width') {
				height = width / aspectRatio;
			} else {
				width = height * aspectRatio;
			}
		}
	}
</script>

<div>
	<label>
		Width:
		<input type="number" bind:value={width} on:input={() => updateDimensions('width')} />
	</label>
	<label>
		Height:
		<input type="number" bind:value={height} on:input={() => updateDimensions('height')} />
	</label>
	<label>
		Maintain aspect ratio:
		<input type="checkbox" bind:checked={maintainAspectRatio} />
	</label>
	<button on:click={resize}>Resize</button>
</div>
