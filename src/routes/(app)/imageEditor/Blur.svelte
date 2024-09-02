<script lang="ts">
	import Konva from 'konva';

	export let stage: Konva.Stage;
	export let layer: Konva.Layer;
	export let imageNode: Konva.Image;

	let blurAmount = 10;
	let overlayType = 'circle'; // Can be 'circle' or 'rectangle'
	let overlayNodes: Konva.Shape[] = [];

	// Create a new blur overlay
	function addBlurOverlay() {
		let overlayNode: Konva.Shape;

		const overlayOptions: Konva.ShapeConfig = {
			x: stage.width() / 2,
			y: stage.height() / 2,
			width: 100,
			height: 100,
			draggable: true,
			stroke: 'red',
			strokeWidth: 2
		};

		if (overlayType === 'circle') {
			overlayNode = new Konva.Circle({
				...overlayOptions,
				radius: 50
			});
		} else if (overlayType === 'rectangle') {
			overlayNode = new Konva.Rect(overlayOptions);
		}

		overlayNode.on('transform', () => {
			if (overlayNode instanceof Konva.Circle) {
				const scale = overlayNode.scaleX();
				overlayNode.radius(overlayNode.radius() * scale);
				overlayNode.scaleX(1);
				overlayNode.scaleY(1);
			}
		});

		layer.add(overlayNode);
		overlayNodes.push(overlayNode);
		layer.draw();
	}

	// Apply blur to all overlay regions
	function applyBlur() {
		overlayNodes.forEach((overlayNode) => {
			const blurArea = overlayNode.getClientRect();
			const canvas = document.createElement('canvas');
			canvas.width = blurArea.width;
			canvas.height = blurArea.height;
			const context = canvas.getContext('2d');

			if (context && imageNode.image()) {
				context.drawImage(
					imageNode.image() as CanvasImageSource,
					blurArea.x,
					blurArea.y,
					blurArea.width,
					blurArea.height,
					0,
					0,
					blurArea.width,
					blurArea.height
				);

				context.filter = `blur(${blurAmount}px)`;
				if (overlayNode instanceof Konva.Circle) {
					context.globalCompositeOperation = 'destination-in';
					context.beginPath();
					context.arc(blurArea.width / 2, blurArea.height / 2, blurArea.width / 2, 0, Math.PI * 2);
					context.closePath();
					context.fill();
				}
				// For rectangles, no additional clipping is necessary

				const blurredImage = new Image();
				blurredImage.src = canvas.toDataURL();

				blurredImage.onload = () => {
					const blurOverlay = new Konva.Image({
						image: blurredImage,
						x: blurArea.x,
						y: blurArea.y,
						width: blurArea.width,
						height: blurArea.height
					});
					layer.add(blurOverlay);
					layer.draw();
				};
			}
		});
	}

	// Remove all overlays (reset)
	function clearBlurs() {
		overlayNodes.forEach((node) => node.destroy());
		overlayNodes = [];
		layer.draw();
	}
</script>

<div class="blur-controls absolute bottom-0 left-0 right-0 top-0 z-50 flex flex-col items-center rounded-md bg-gray-800 p-4 text-white">
	<div class="mb-4">
		<button class="gradient-tertiary btn w-full max-w-xs text-white" on:click={addBlurOverlay}>
			<iconify-icon icon="mdi:blur" color="white" width="18" class="mr-1" />Add Blur
		</button>
	</div>
	<div class="mb-4">
		<label for="blur">Blur Strength:</label>
		<input id="blur" type="range" min="0" max="40" bind:value={blurAmount} class="w-full max-w-xs" />
		<span>{blurAmount}</span>
	</div>
	<div class="mb-4">
		<label for="overlay-type">Shape:</label>
		<select id="overlay-type" bind:value={overlayType} class="w-full max-w-xs">
			<option value="circle">Circle</option>
			<option value="rectangle">Rectangle</option>
		</select>
	</div>
	<div class="mt-auto flex gap-4">
		<button class="gradient-tertiary btn text-white" on:click={applyBlur}>Apply</button>
		<button class="btn bg-red-600 text-white" on:click={clearBlurs}>Clear</button>
	</div>
</div>

<style>
	.blur-controls {
		background-color: rgba(0, 0, 0, 0.8);
		display: none;
	}

	.blur-controls.active {
		display: flex;
	}
</style>
