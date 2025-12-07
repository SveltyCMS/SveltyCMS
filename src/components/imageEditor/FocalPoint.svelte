<!--
@file: src/components/imageEditor/FocalPoint.svelte
@component
A component that renders a draggable focal point crosshair on a Konva stage.
-->
<script lang="ts">
	import Konva from 'konva';
	import { onMount, createEventDispatcher } from 'svelte';

	const {
		stage,
		imageNode,
		x,
		y
	}: {
		stage: Konva.Stage;
		imageNode: Konva.Image;
		x?: number;
		y?: number;
	} = $props();

	const dispatch = createEventDispatcher();

	let crosshair: Konva.Group;

	onMount(() => {
		const group = new Konva.Group({
			draggable: true,
			x: x !== undefined ? imageNode.getClientRect().x + (imageNode.getClientRect().width * x) / 100 : stage.width() / 2,
			y: y !== undefined ? imageNode.getClientRect().y + (imageNode.getClientRect().height * y) / 100 : stage.height() / 2
		});

		const circle = new Konva.Circle({
			radius: 20,
			stroke: 'rgba(255, 255, 255, 0.8)',
			strokeWidth: 2,
			dash: [4, 4]
		});

		const horizLine = new Konva.Line({
			points: [-25, 0, 25, 0],
			stroke: 'rgba(255, 255, 255, 0.8)',
			strokeWidth: 1
		});

		const vertLine = new Konva.Line({
			points: [0, -25, 0, 25],
			stroke: 'rgba(255, 255, 255, 0.8)',
			strokeWidth: 1
		});

		group.add(circle, horizLine, vertLine);
		stage.getLayers()[0].add(group);
		crosshair = group;

		group.on('dragend', () => {
			const pos = group.position();
			const imageRect = imageNode.getClientRect();

			// Calculate position relative to the image, as a percentage
			const x = ((pos.x - imageRect.x) / imageRect.width) * 100;
			const y = ((pos.y - imageRect.y) / imageRect.height) * 100;

			dispatch('apply', { x: Math.round(x), y: Math.round(y) });
		});

		return () => {
			crosshair?.destroy();
		};
	});
</script>
