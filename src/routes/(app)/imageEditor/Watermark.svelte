<!-- 
@file: /src/routes/(app)/imageEditor/Watermark.svelte
@component
**This component allows users to add, position, and customize a watermark overlay on an image**
Users can adjust the watermark's position, opacity, scale, rotation, and offsets

#### Props 
- `stage`: Konva.Stage - The Konva stage where the image is displayed.
- `layer`: Konva.Layer - The Konva layer where the image and effects are added.
- `imageNode`: Konva.Image - The Konva image node representing the original image.
- `on:change` (optional): Function to be called when the watermark settings change.
- `on:exitWatermark` (optional): Function to be called when exiting watermark mode.
-->

<script lang="ts">
	import Konva from 'konva';
	import type { WatermarkProps, WatermarkPosition } from './watermarkTypes';

	const WATERMARK_POSITION = {
		'top-left': 'top-left',
		'top-center': 'top-center',
		'top-right': 'top-right',
		'center-left': 'center-left',
		center: 'center',
		'center-right': 'center-right',
		'bottom-left': 'bottom-left',
		'bottom-center': 'bottom-center',
		'bottom-right': 'bottom-right'
	} as const;

	let { stage, layer, imageNode, onWatermarkChange, onExitWatermark }: WatermarkProps = $props();

	let watermarkFile: File | null = $state(null);
	let position: WatermarkPosition = $state(WATERMARK_POSITION.center);
	let opacity = $state(1);
	let scale = $state(100);
	let offsetX = $state(0);
	let offsetY = $state(0);
	let rotation = $state(0);

	let watermarkPreview: string | null = $state(null);
	let watermarkNode: Konva.Image | null = $state(null);

	// Cleanup effect
	$effect.root(() => {
		return () => {
			if (watermarkNode) {
				watermarkNode.destroy();
			}
		};
	});

	function applyWatermark() {
		if (!watermarkPreview) return;

		if (watermarkNode) {
			watermarkNode.destroy();
		}

		const watermarkImage = new Image();
		watermarkImage.src = watermarkPreview;
		watermarkImage.onload = () => {
			watermarkNode = new Konva.Image({
				image: watermarkImage,
				opacity: opacity,
				scaleX: scale / 100,
				scaleY: scale / 100,
				rotation: rotation
			});

			const { x, y } = calculateWatermarkPosition();
			watermarkNode.position({ x: x + offsetX, y: y + offsetY });

			layer.add(watermarkNode);
			layer.batchDraw();
		};
	}

	function calculateWatermarkPosition() {
		const imageWidth = imageNode.width() * imageNode.scaleX();
		const imageHeight = imageNode.height() * imageNode.scaleY();

		let x = 0;
		let y = 0;

		switch (position) {
			case WATERMARK_POSITION['top-left']:
				x = 0;
				y = 0;
				break;
			case WATERMARK_POSITION['top-center']:
				x = imageWidth / 2;
				y = 0;
				break;
			case WATERMARK_POSITION['top-right']:
				x = imageWidth;
				y = 0;
				break;
			case WATERMARK_POSITION['center-left']:
				x = 0;
				y = imageHeight / 2;
				break;
			case WATERMARK_POSITION.center:
				x = imageWidth / 2;
				y = imageHeight / 2;
				break;
			case WATERMARK_POSITION['center-right']:
				x = imageWidth;
				y = imageHeight / 2;
				break;
			case WATERMARK_POSITION['bottom-left']:
				x = 0;
				y = imageHeight;
				break;
			case WATERMARK_POSITION['bottom-center']:
				x = imageWidth / 2;
				y = imageHeight;
				break;
			case WATERMARK_POSITION['bottom-right']:
				x = imageWidth;
				y = imageHeight;
				break;
		}

		return { x, y };
	}

	function handleChange() {
		applyWatermark();
		onWatermarkChange?.({
			watermarkFile,
			position,
			opacity,
			scale,
			offsetX,
			offsetY,
			rotation
		});
	}

	function handleFileChange(event: Event) {
		const target = event.target as HTMLInputElement;
		if (target.files && target.files.length > 0) {
			watermarkFile = target.files[0];
			const reader = new FileReader();
			reader.onload = (e) => {
				watermarkPreview = e.target?.result as string;
				applyWatermark();
			};
			reader.readAsDataURL(watermarkFile);
		}
	}

	function removeWatermark() {
		watermarkFile = null;
		watermarkPreview = null;
		if (watermarkNode) {
			watermarkNode.destroy();
			watermarkNode = null;
			layer.batchDraw();
		}
		handleChange();
	}

	function formatValue(value: number, suffix: string = ''): string {
		return `${value.toFixed(2)}${suffix}`;
	}

	function triggerExitWatermark() {
		onExitWatermark?.();
	}
</script>

<div class="wrapper">
	<div class="align-center flex w-full items-center gap-4">
		<!-- Back button at top of component -->
		<button onclick={triggerExitWatermark} aria-label="Exit rotation mode" class="variant-outline-tertiary btn-icon">
			<iconify-icon icon="material-symbols:close-rounded" width="20"></iconify-icon>
		</button>

		<h3 class="relative text-center text-lg font-bold text-tertiary-500 dark:text-primary-500">Watermark Settings</h3>
	</div>

	<div class="mb-4">
		{#if watermarkPreview}
			<div class="relative mb-2 h-32 w-32">
				<img src={watermarkPreview} alt="Watermark preview" class="border-base-300 h-full w-full rounded border object-contain" />
				<button class="bg-error absolute -right-2 -top-2 rounded-full p-1 text-xs text-white" onclick={removeWatermark}> X </button>
			</div>
		{:else}
			<label class="variant-outline-primary btn mb-2">
				Upload Watermark
				<input type="file" accept="image/*" onchange={handleFileChange} class="hidden" />
			</label>
		{/if}
	</div>

	<div class="mb-4 grid grid-cols-2 gap-4">
		<label class="flex flex-col">
			<span class="mb-1">Position:</span>
			<select bind:value={position} onchange={handleChange} class="input-bordered input">
				{#each Object.entries(WATERMARK_POSITION) as [key, value]}
					<option {value}>{key}</option>
				{/each}
			</select>
		</label>

		<label class="flex flex-col">
			<span class="mb-1">Opacity: {formatValue(opacity)}</span>
			<input type="range" min="0" max="1" step="0.05" bind:value={opacity} oninput={handleChange} class="range" />
		</label>

		<label class="flex flex-col">
			<span class="mb-1">Scale: {formatValue(scale, '%')}</span>
			<input type="range" min="10" max="200" step="1" bind:value={scale} oninput={handleChange} class="range" />
		</label>

		<label class="flex flex-col">
			<span class="mb-1">Rotation: {formatValue(rotation, '°')}</span>
			<input type="range" min="0" max="360" step="1" bind:value={rotation} oninput={handleChange} class="range" />
		</label>
	</div>

	<div class="mb-4 grid grid-cols-2 gap-4">
		<label class="flex flex-col">
			<span class="mb-1">Offset X: {formatValue(offsetX, 'px')}</span>
			<input type="range" min="-100" max="100" step="1" bind:value={offsetX} oninput={handleChange} class="range" />
		</label>

		<label class="flex flex-col">
			<span class="mb-1">Offset Y: {formatValue(offsetY, 'px')}</span>
			<input type="range" min="-100" max="100" step="1" bind:value={offsetY} oninput={handleChange} class="range" />
		</label>
	</div>
</div>
