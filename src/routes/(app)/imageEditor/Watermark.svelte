<!-- Watermark.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	enum WATERMARK_POSITION {
		'top-left' = 'top-left',
		'top-center' = 'top-center',
		'top-right' = 'top-right',
		'center-left' = 'center-left',
		'center' = 'center',
		'center-right' = 'center-right',
		'bottom-left' = 'bottom-left',
		'bottom-center' = 'bottom-center',
		'bottom-right' = 'bottom-right'
	}

	export let watermarkFile: File | null = null;
	export let position: WATERMARK_POSITION = WATERMARK_POSITION.center;
	export let opacity = 1;
	export let scale = 100;
	export let offsetX = 0;
	export let offsetY = 0;
	export let rotation = 0;

	const dispatch = createEventDispatcher();

	let watermarkPreview: string | null = null;

	function handleChange() {
		dispatch('change', {
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
			};
			reader.readAsDataURL(watermarkFile);
			handleChange();
		}
	}

	function removeWatermark() {
		watermarkFile = null;
		watermarkPreview = null;
		handleChange();
	}

	function formatValue(value: number, suffix: string = ''): string {
		return `${value.toFixed(2)}${suffix}`;
	}
</script>

<div class="watermark-controls absolute bottom-4 left-4 z-50 rounded-md bg-gray-800 p-4 text-white">
	<h3 class="mb-4 text-lg font-bold">Watermark Settings</h3>

	<div class="mb-4">
		{#if watermarkPreview}
			<div class="relative mb-2 h-32 w-32">
				<img src={watermarkPreview} alt="Watermark preview" class="h-full w-full object-contain" />
				<button class="absolute -right-2 -top-2 rounded-full bg-red-500 p-1 text-xs" on:click={removeWatermark}> X </button>
			</div>
		{:else}
			<label class="gradient-tertiary btn mb-2 cursor-pointer">
				Upload Watermark
				<input type="file" accept="image/*" on:change={handleFileChange} class="hidden" />
			</label>
		{/if}
	</div>

	<div class="mb-4 grid grid-cols-2 gap-4">
		<label class="flex flex-col">
			<span class="mb-1">Position:</span>
			<select bind:value={position} on:change={handleChange} class="rounded px-2 py-1 text-black">
				{#each Object.entries(WATERMARK_POSITION) as [key, value]}
					<option {value}>{key}</option>
				{/each}
			</select>
		</label>

		<label class="flex flex-col">
			<span class="mb-1">Opacity: {formatValue(opacity)}</span>
			<input type="range" min="0" max="1" step="0.05" bind:value={opacity} on:input={handleChange} />
		</label>

		<label class="flex flex-col">
			<span class="mb-1">Scale: {formatValue(scale, '%')}</span>
			<input type="range" min="10" max="200" step="1" bind:value={scale} on:input={handleChange} />
		</label>

		<label class="flex flex-col">
			<span class="mb-1">Rotation: {formatValue(rotation, '°')}</span>
			<input type="range" min="0" max="360" step="1" bind:value={rotation} on:input={handleChange} />
		</label>
	</div>

	<div class="mb-4 grid grid-cols-2 gap-4">
		<label class="flex flex-col">
			<span class="mb-1">Offset X: {offsetX}px</span>
			<input type="range" min="-100" max="100" step="1" bind:value={offsetX} on:input={handleChange} />
		</label>

		<label class="flex flex-col">
			<span class="mb-1">Offset Y: {offsetY}px</span>
			<input type="range" min="-100" max="100" step="1" bind:value={offsetY} on:input={handleChange} />
		</label>
	</div>
</div>

<style>
	.watermark-controls {
		background-color: rgba(0, 0, 0, 0.6);
		max-width: 400px;
	}

	input[type='range'] {
		width: 100%;
		margin: 0;
	}
</style>
