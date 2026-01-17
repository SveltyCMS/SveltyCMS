<!--
@file shared/components/src/imageEditor/FocalPoint.svelte
@component
A component that renders a draggable focal point crosshair on a Konva stage.
-->
<script lang="ts">
	import Konva from 'konva';
	import { onMount } from 'svelte';

	let {
		stage,
		imageNode,
		x,
		y,
		onapply = () => {}
	}: {
		stage: Konva.Stage;
		imageNode: Konva.Image;
		x?: number;
		y?: number;
		onapply?: (detail: { x: number; y: number }) => void;
	} = $props();

	let crosshair: Konva.Group;

	onMount(() => {
		const group = new Konva.Group({
			draggable: true,
			x: x !== undefined ? imageNode.getClientRect().x + (imageNode.getClientRect().width * x) / 100 : stage.width() / 2,
			y: y !== undefined ? imageNode.getClientRect().y + (imageNode.getClientRect().height * y) / 100 : stage.height() / 2,
			dragBoundFunc: (pos) => {
				const imageRect = imageNode.getClientRect();
				const x = Math.max(imageRect.x, Math.min(imageRect.x + imageRect.width, pos.x));
				const y = Math.max(imageRect.y, Math.min(imageRect.y + imageRect.height, pos.y));
				return { x, y };
			}
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
			let x = ((pos.x - imageRect.x) / imageRect.width) * 100;
			let y = ((pos.y - imageRect.y) / imageRect.height) * 100;

			// Clamp values
			x = Math.max(0, Math.min(100, x));
			y = Math.max(0, Math.min(100, y));

			onapply({ x: Math.round(x), y: Math.round(y) });
		});

		return () => {
			crosshair?.destroy();
		};
	});
</script>
