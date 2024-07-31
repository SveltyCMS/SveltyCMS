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

	function handleChange() {
		dispatch('change');
	}

	function handleFileChange(event: Event) {
		const target = event.target as HTMLInputElement;
		if (target.files && target.files.length > 0) {
			watermarkFile = target.files[0];
			handleChange();
		}
	}
</script>

<div class="watermark-controls">
	<input type="file" accept="image/*" on:change={handleFileChange} />

	<select bind:value={position} on:change={handleChange}>
		{#each Object.entries(WATERMARK_POSITION) as [key, value]}
			<option {value}>{key}</option>
		{/each}
	</select>

	<label>
		Opacity:
		<input type="range" min="0" max="1" step="0.1" bind:value={opacity} on:input={handleChange} />
	</label>

	<label>
		Scale:
		<input type="range" min="10" max="200" step="1" bind:value={scale} on:input={handleChange} />
	</label>

	<label>
		Offset X:
		<input type="number" bind:value={offsetX} on:input={handleChange} />
	</label>

	<label>
		Offset Y:
		<input type="number" bind:value={offsetY} on:input={handleChange} />
	</label>

	<label>
		Rotation:
		<input type="range" min="0" max="360" step="1" bind:value={rotation} on:input={handleChange} />
	</label>
</div>

<style>
	.watermark-controls {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	label {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	input[type='range'] {
		width: 200px;
	}
</style>
