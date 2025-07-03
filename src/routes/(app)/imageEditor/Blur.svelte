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

	const { stage, layer, imageNode, onBlurReset = () => {}, onBlurApplied = () => {} } = $props() as Props;

	let mosaicStrength = $state(10);
	let blurRegion: Konva.Rect;
	let transformer: Konva.Transformer;
	let isSelecting = $state(false);
	let startPoint = $state<{ x: number; y: number } | null>(null);
	let mosaicOverlay: Konva.Image;

	// Initialize stage event listeners
	$effect.root(() => {
		stage.on('mousedown touchstart', handleMouseDown);
		stage.on('mousemove touchmove', handleMouseMove);
		stage.on('mouseup touchend', handleMouseUp);
		stage.container().style.cursor = 'crosshair';

		// Cleanup function
		return () => {
			stage.off('mousedown touchstart', handleMouseDown);
			stage.off('mousemove touchmove', handleMouseMove);
			stage.off('mouseup touchend', handleMouseUp);
			stage.container().style.cursor = 'default';

			// Clean up blur elements when component is destroyed
			if (blurRegion) {
				blurRegion.destroy();
			}
			if (transformer) {
				transformer.destroy();
			}
			if (mosaicOverlay) {
				mosaicOverlay.destroy();
			}
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
				strokeWidth: 1,
				dash: [5, 5],
				draggable: true
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
			const width = Math.abs(blurRegion.width());
			const height = Math.abs(blurRegion.height());
			blurRegion.width(width);
			blurRegion.height(height);
			if (blurRegion.x() > blurRegion.x() + width) {
				blurRegion.x(blurRegion.x() - width);
			}
			if (blurRegion.y() > blurRegion.y() + height) {
				blurRegion.y(blurRegion.y() - height);
			}

			transformer = new Konva.Transformer({
				nodes: [blurRegion],
				borderDash: [5, 5],
				borderStrokeWidth: 1,
				borderStroke: 'white',
				anchorStroke: '#0000FF',
				anchorFill: '#0000FF',
				anchorSize: 12, // Increased size
				anchorCornerRadius: 6,
				enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
				rotateAnchorOffset: 30,
				rotateEnabled: false // Disable rotate functionality
			});

			// Add custom rotate anchor at the bottom
			const rotateAnchor = new Konva.Circle({
				x: blurRegion.width() / 2,
				y: blurRegion.height() + 30,
				radius: 8,
				fill: '#0000FF',
				stroke: '#0000FF',
				strokeWidth: 2,
				draggable: true,
				dragBoundFunc: function (pos) {
					const center = {
						x: blurRegion.x() + blurRegion.width() / 2,
						y: blurRegion.y() + blurRegion.height() / 2
					};
					const angle = Math.atan2(pos.y - center.y, pos.x - center.x);
					blurRegion.rotation((angle * 180) / Math.PI);
					applyMosaic();
					return {
						x: center.x + Math.cos(angle) * (blurRegion.height() / 2 + 30),
						y: center.y + Math.sin(angle) * (blurRegion.height() / 2 + 30)
					};
				}
			});

			transformer.add(rotateAnchor);
			layer.add(transformer);

			blurRegion.on('transform', applyMosaic);
			blurRegion.on('dragmove', applyMosaic);

			layer.batchDraw();
			applyMosaic();
		}
	}

	function applyMosaic() {
		if (!blurRegion) return;

		const canvas = document.createElement('canvas');
		canvas.width = stage.width();
		canvas.height = stage.height();
		const context = canvas.getContext('2d');
		const image = imageNode.image();

		if (context && image) {
			context.drawImage(image, 0, 0, canvas.width, canvas.height);

			const rect = blurRegion.getClientRect({ relativeTo: stage });

			context.save();
			context.beginPath();
			context.rect(rect.x, rect.y, rect.width, rect.height);
			context.clip();

			const tileSize = Math.max(1, Math.floor(mosaicStrength));
			for (let y = rect.y; y < rect.y + rect.height; y += tileSize) {
				for (let x = rect.x; x < rect.x + rect.width; x += tileSize) {
					const pixelData = context.getImageData(x, y, 1, 1).data;
					context.fillStyle = `rgb(${pixelData[0]}, ${pixelData[1]}, ${pixelData[2]})`;
					context.fillRect(x, y, tileSize, tileSize);
				}
			}

			context.restore();

			if (mosaicOverlay) {
				mosaicOverlay.destroy();
			}

			mosaicOverlay = new Konva.Image({
				image: canvas,
				x: 0,
				y: 0,
				width: stage.width(),
				height: stage.height()
			});

			layer.add(mosaicOverlay);
			mosaicOverlay.moveToBottom();
			mosaicOverlay.moveUp();
			layer.batchDraw();
		}
	}

	function updateMosaicStrength() {
		applyMosaic();
	}

	function exitBlur() {
		// Clean up any existing blur elements before exiting
		if (blurRegion) {
			blurRegion.destroy();
		}
		if (transformer) {
			transformer.destroy();
		}
		if (mosaicOverlay) {
			mosaicOverlay.destroy();
		}
		layer.batchDraw();
		onBlurReset();
	}

	function resetMosaic() {
		if (blurRegion) {
			blurRegion.destroy();
		}
		if (transformer) {
			transformer.destroy();
		}
		if (mosaicOverlay) {
			mosaicOverlay.destroy();
		}
		layer.batchDraw();
		onBlurReset();
	}

	function applyFinalMosaic() {
		applyMosaic();
		onBlurApplied();
	}
</script>

<div class="wrapper">
	<div class="align-center mb-2 flex w-full items-center">
		<div class="flex w-full items-center justify-between">
			<div class="flex items-center gap-2">
				<!-- Back button at top of component -->
				<button onclick={exitBlur} aria-label="Exit rotation mode" class="variant-outline-tertiary btn-icon">
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
				<button onclick={applyFinalMosaic} class="variant-filled-primary btn" aria-label="Apply blur effect"> Apply </button>
			</div>
		</div>
	</div>

	<div class="flex items-center justify-around space-x-4"></div>
</div>
