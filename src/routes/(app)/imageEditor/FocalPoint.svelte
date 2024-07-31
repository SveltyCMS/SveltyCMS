<!-- FocalPoint.svelte -->
<script lang="ts">
	import Konva from 'konva';
	import { onMount } from 'svelte';

	export let stage: Konva.Stage;
	export let layer: Konva.Layer;
	export let imageNode: Konva.Image;

	let focalPoint: Konva.Circle;

	onMount(() => {
		focalPoint = new Konva.Circle({
			x: stage.width() / 2,
			y: stage.height() / 2,
			radius: 10,
			fill: 'red',
			draggable: true
		});

		layer.add(focalPoint);
		layer.draw();

		focalPoint.on('dragmove', () => {
			// You can use the focal point position for further processing
			console.log('Focal point:', focalPoint.x(), focalPoint.y());
		});
	});
</script>

<div>Drag the red circle to set the focal point</div>
