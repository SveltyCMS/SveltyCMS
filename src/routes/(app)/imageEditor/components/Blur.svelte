<!-- 
@file src/routes/(app)/imageEditor/Blur.svelte
@component
**Blur effect component using Konva canvas used for image editing**

### Events
- `blurReset`: Dispatched when blur effect is reset
- `blurApplied`: Dispatched when blur effect is applied
-->
<script lang="ts">
	import Konva from 'konva';

	interface Props {
		stage: Konva.Stage;
		layer: Konva.Layer;
		imageNode: Konva.Image;
		onBlurReset?: () => void;
		onBlurApplied?: () => void;
	}

	const {
		stage,
		layer,
		imageNode,
		onBlurReset = () => {},
		onBlurApplied = () => {}
	} = $props() as Props;

	let mosaicStrength = $state(10);
	let blurRegion: Konva.Rect | null = $state(null);
	let transformer: Konva.Transformer | null = $state(null);
	let isSelecting = $state(false);
	let startPoint = $state<{ x: number; y: number } | null>(null);

	// --- PERFORMANCE OPTIMIZATION ---
	// Create overlay and offscreen canvas only ONCE to prevent memory churn
	let mosaicOverlay: Konva.Image | null = $state(null);
	let offscreenCanvas: HTMLCanvasElement | null = $state(null);
	let offscreenContext: CanvasRenderingContext2D | null = $state(null);

	// Initialize stage event listeners
	$effect.root(() => {
		stage.on('mousedown touchstart', handleMouseDown);
		stage.on('mousemove touchmove', handleMouseMove);
		stage.on('mouseup touchend', handleMouseUp);
		stage.container().style.cursor = 'crosshair';

		// Initialize offscreen canvas
		offscreenCanvas = document.createElement('canvas');
		offscreenCanvas.width = stage.width();
		offscreenCanvas.height = stage.height();
		offscreenContext = offscreenCanvas.getContext('2d', { willReadFrequently: false });

		// Initialize mosaic overlay
		mosaicOverlay = new Konva.Image({
			image: offscreenCanvas,
			x: 0,
			y: 0,
			width: stage.width(),
			height: stage.height(),
			listening: false,
			name: 'blurOverlay' // For cleanup
		});
		layer.add(mosaicOverlay);
		mosaicOverlay.moveToBottom();
		mosaicOverlay.moveUp(); // Place it right above the main image

		// Cleanup function
		return () => {
			stage.off('mousedown touchstart', handleMouseDown);
			stage.off('mousemove touchmove', handleMouseMove);
			stage.off('mouseup touchend', handleMouseUp);
			stage.container().style.cursor = 'default';

			// Clean up blur elements
			blurRegion?.destroy();
			transformer?.destroy();
			mosaicOverlay?.destroy();
			
			// Nullify states
			blurRegion = null;
			transformer = null;
			mosaicOverlay = null;
			offscreenCanvas = null;
			offscreenContext = null;
		};
	});

	function handleMouseDown() {
		if (blurRegion) return;

		isSelecting = true;
		const pos = stage.getPointerPosition();
		startPoint = pos ? { x: pos.x, y: pos.y } : null;
	}

	function handleMouseMove() {
		if (!isSelecting || !startPoint) return;

		const pos = stage.getPointerPosition();
		if (!pos) return;

		if (!blurRegion) {
			blurRegion = new Konva.Rect({
				x: startPoint.x,
				y: startPoint.y,
				width: pos.x - startPoint.x,
				height: pos.y - startPoint.y,
				stroke: 'white',
				strokeWidth: 2,
				dash: [6, 4],
				draggable: true,
				name: 'blurRegion' // For cleanup
			});
			layer.add(blurRegion);
		} else {
			blurRegion.width(pos.x - startPoint.x);
			blurRegion.height(pos.y - startPoint.y);
		}
		layer.batchDraw();
	}

	function handleMouseUp() {
		if (!isSelecting) return;
		isSelecting = false;

		if (blurRegion) {
			// Normalize rect (handle drawing in any direction)
			if (blurRegion.width() < 0) {
				blurRegion.x(blurRegion.x() + blurRegion.width());
				blurRegion.width(-blurRegion.width());
			}
			if (blurRegion.height() < 0) {
				blurRegion.y(blurRegion.y() + blurRegion.height());
				blurRegion.height(-blurRegion.height());
			}

			transformer = new Konva.Transformer({
				nodes: [blurRegion],
				borderDash: [6, 4],
				borderStrokeWidth: 2,
				borderStroke: 'white',
				anchorStroke: '#007aff',
				anchorFill: '#007aff',
				anchorSize: 12,
				anchorCornerRadius: 6,
				rotateEnabled: false, // <-- SIMPLIFIED: Disable rotation for blur
				name: 'blurTransformer' // For cleanup
			});

			layer.add(transformer);

			blurRegion.on('transform', applyMosaic);
			blurRegion.on('dragmove', applyMosaic);
			
			layer.batchDraw();
			applyMosaic();
		}
	}

	/**
	 * --- HIGH PERFORMANCE MOSAIC ---
	 * This function creates a pixelated effect without using slow `getImageData`.
	 * 1. Draws the original image to an offscreen canvas.
	 * 2. Disables image smoothing.
	 * 3. Draws a tiny, scaled-down version of the blur region onto itself.
	 * 4. Draws that tiny version back up to the full size, creating the mosaic.
	 * 5. Updates the single `mosaicOverlay` Konva.Image.
	 */
	function applyMosaic() {
		if (!blurRegion || !offscreenContext || !offscreenCanvas || !mosaicOverlay) return;

		const image = imageNode.image();
		if (!image) return;

		const ctx = offscreenContext;
		const canvas = offscreenCanvas;
		
		// Get the absolute bounding box of the blur region on the stage
		const rect = blurRegion.getClientRect({ relativeTo: stage });
		
		const tileSize = Math.max(1, Math.floor(mosaicStrength));

		// 1. Clear canvas and draw the full original image
		// We must account for the imageNode's group transforms
		ctx.save();
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		const tr = imageNode.getAbsoluteTransform({ relativeTo: stage });
		ctx.transform(tr.m[0], tr.m[1], tr.m[2], tr.m[3], tr.m[4], tr.m[5]);
		ctx.drawImage(image, imageNode.x(), imageNode.y(), imageNode.width(), imageNode.height());
		ctx.restore();

		// 2. Disable image smoothing to get sharp pixels
		ctx.imageSmoothingEnabled = false;

		// 3. Draw a tiny version of the blur area *onto* the canvas
		// This samples the pixels
		ctx.drawImage(
			canvas,
			rect.x, rect.y, rect.width, rect.height, // Source region
			rect.x, rect.y, rect.width / tileSize, rect.height / tileSize // Destination region (tiny)
		);

		// 4. Draw the tiny version back up to the original size
		// This scales the sampled pixels, creating the mosaic effect
		ctx.drawImage(
			canvas,
			rect.x, rect.y, rect.width / tileSize, rect.height / tileSize, // Source region (tiny)
			rect.x, rect.y, rect.width, rect.height // Destination region (full size)
		);

		// 5. Re-enable smoothing for other operations
		ctx.imageSmoothingEnabled = true;

		// Update the Konva.Image with the new canvas content
		mosaicOverlay.image(canvas);
		// Cache the overlay for performance
		mosaicOverlay.cache();
		
		layer.batchDraw();
	}

	function updateMosaicStrength() {
		applyMosaic();
	}

	function cleanupAndExit(isApply: boolean) {
		// Clean up all nodes
		blurRegion?.destroy();
		transformer?.destroy();
		mosaicOverlay?.destroy();
		
		// Clear states
		blurRegion = null;
		transformer = null;
		mosaicOverlay = null;

		layer.batchDraw();
		
		if (isApply) {
			onBlurApplied();
		} else {
			onBlurReset();
		}
	}

	function resetMosaic() {
		if (blurRegion) {
			blurRegion.destroy();
			blurRegion = null;
		}
		if (transformer) {
			transformer.destroy();
			transformer = null;
		}
		// Clear the overlay canvas
		if (offscreenContext && offscreenCanvas) {
			offscreenContext.clearRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
		}
		if (mosaicOverlay) {
			mosaicOverlay.image(offscreenCanvas);
			mosaicOverlay.cache();
		}
		layer.batchDraw();
	}
</script>

<div class="wrapper">
	<div class="align-center mb-2 flex w-full items-center">
		<div class="flex w-full items-center justify-between">
			<div class="flex items-center gap-2">
				<button onclick={() => cleanupAndExit(false)} aria-label="Exit blur mode" class="variant-outline-tertiary btn-icon">
					<iconify-icon icon="material-symbols:close-rounded" width="20"></iconify-icon>
				</button>

				<h3 class="relative text-center text-lg font-bold text-tertiary-500 dark:text-primary-500">Blur Settings</h3>
			</div>

			<div class="flex flex-col space-y-2">
				<label for="mosaic-strength" class="text-sm font-medium">Blur Strength:</label>
				<input
					id="mosaic-strength"
					type="range"
					min="1"
					max="50"
					bind:value={mosaicStrength}
					oninput={updateMosaicStrength}
					class="h-2 w-full cursor-pointer rounded-full bg-gray-300"
					aria-valuemin="1"
					aria-valuemax="50"
					aria-valuenow={mosaicStrength}
					aria-valuetext={`${mosaicStrength} pixels`}
				/>
				<span class="sr-only">Current mosaic strength: {mosaicStrength} pixels</span>
			</div>

			<div class="flex items-center gap-4">
				<button onclick={resetMosaic} class="variant-filled-error btn" aria-label="Reset blur effect"> Reset </button>
				<button onclick={() => cleanupAndExit(true)} class="variant-filled-primary btn" aria-label="Apply blur effect"> Apply </button>
			</div>
		</div>
	</div>

	<div class="flex items-center justify-around space-x-4"></div>
</div>