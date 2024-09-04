<!-- 
@file src/routes/(app)/imageEditor/Blur.svelte
@description This component allows users to apply a blur effect to a specific region of an image within a Konva stage.
-->

<script lang="ts">
	import Konva from 'konva';
	import { onMount, createEventDispatcher } from 'svelte';

	export let stage: Konva.Stage;
	export let layer: Konva.Layer;
	export let imageNode: Konva.Image;

	let blurAmount = 10;
	let overlayType = 'circle';
	let overlayNode: Konva.Shape | null = null;
	let transformer: Konva.Transformer;
	let isBlurActive = false;

	const dispatch = createEventDispatcher();

	onMount(() => {
		transformer = new Konva.Transformer({
			enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
			rotateEnabled: false,
			boundBoxFunc: (oldBox, newBox) => {
				if (newBox.width < 30 || newBox.height < 30) {
					return oldBox;
				}
				return newBox;
			}
		});
		layer.add(transformer);
		layer.draw();
	});

	function addBlurOverlay() {
		clearBlurs();
		isBlurActive = true;

		const overlayOptions: Konva.ShapeConfig = {
			x: stage.width() / 4,
			y: stage.height() / 4,
			width: stage.width() / 2,
			height: stage.height() / 2,
			draggable: true,
			stroke: 'white',
			strokeWidth: 2,
			name: 'blurOverlay'
		};

		if (overlayType === 'circle') {
			overlayNode = new Konva.Circle({
				...overlayOptions,
				radius: Math.min(stage.width(), stage.height()) / 4
			});
		} else {
			overlayNode = new Konva.Rect(overlayOptions);
		}

		overlayNode.on('transform', () => {
			applyBlur(true);
		});

		layer.add(overlayNode);
		transformer.nodes([overlayNode]);
		layer.add(transformer);
		layer.draw();
	}

	function applyBlur(preview = false) {
		if (!overlayNode) return;

		const canvas = document.createElement('canvas');
		canvas.width = stage.width();
		canvas.height = stage.height();
		const context = canvas.getContext('2d');

		if (context && imageNode.image()) {
			context.drawImage(imageNode.image() as CanvasImageSource, 0, 0, stage.width(), stage.height());

			context.filter = `blur(${blurAmount}px)`;
			context.globalCompositeOperation = 'source-in';

			if (overlayType === 'circle' && overlayNode instanceof Konva.Circle) {
				context.beginPath();
				context.arc(overlayNode.x(), overlayNode.y(), overlayNode.radius(), 0, Math.PI * 2);
				context.closePath();
			} else if (overlayType === 'rectangle' && overlayNode instanceof Konva.Rect) {
				context.beginPath();
				context.rect(overlayNode.x(), overlayNode.y(), overlayNode.width() * overlayNode.scaleX(), overlayNode.height() * overlayNode.scaleY());
				context.closePath();
			}

			context.fill();

			const blurredImage = new Image();
			blurredImage.src = canvas.toDataURL();

			blurredImage.onload = () => {
				const blurOverlay = new Konva.Image({
					image: blurredImage,
					x: 0,
					y: 0,
					width: stage.width(),
					height: stage.height(),
					opacity: preview ? 0.5 : 1
				});

				layer.add(blurOverlay);
				if (!preview) {
					layer.draw();
					dispatch('blurApplied');
					isBlurActive = false;
				}
			};
		}
	}

	function clearBlurs() {
		if (overlayNode) {
			overlayNode.destroy();
			transformer.nodes([]);
		}
		layer.find('.blurOverlay').forEach((node) => node.destroy());
		layer.draw();
		isBlurActive = false;
	}

	function updateBlurStrength() {
		applyBlur(true);
	}
</script>

<!-- Blur Controls UI -->
<div class="blur-controls bg-base-800 absolute left-4 top-4 z-50 flex items-center space-x-4 rounded-md p-4 text-white shadow-lg">
	{#if isBlurActive}
		<div class="flex flex-col space-y-2">
			<label for="blur-strength" class="text-sm font-medium">Blur Strength:</label>
			<input id="blur-strength" type="range" min="0" max="40" bind:value={blurAmount} on:input={updateBlurStrength} class="range" />
		</div>
		<div class="flex flex-col space-y-2">
			<label for="blur-shape" class="text-sm font-medium">Shape:</label>
			<select id="blur-shape" bind:value={overlayType} on:change={addBlurOverlay} class="select-bordered select text-black">
				<option value="circle">Circle</option>
				<option value="rectangle">Rectangle</option>
			</select>
		</div>
		<div class="flex space-x-2">
			<button on:click={() => applyBlur(false)} class="btn-primary btn">Apply</button>
			<button on:click={clearBlurs} class="btn-error btn">Cancel</button>
		</div>
	{:else}
		<button on:click={addBlurOverlay} class="btn-primary btn">Add Blur</button>
	{/if}
</div>
