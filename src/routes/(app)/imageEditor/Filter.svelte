<!-- Filter.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import Konva from 'konva';

	export let stage: Konva.Stage;
	export let layer: Konva.Layer;
	export let imageNode: Konva.Image;

	const dispatch = createEventDispatcher();

	function applyFilter(filterType: string, value: number | boolean) {
		dispatch('filter', { filterType, value });
	}

	function applyBrighten(event: Event) {
		const value = parseFloat((event.target as HTMLInputElement).value);
		applyFilter('brighten', value);
	}

	function applyContrast(event: Event) {
		const value = parseFloat((event.target as HTMLInputElement).value);
		applyFilter('contrast', value);
	}

	function applySaturation(event: Event) {
		const value = parseFloat((event.target as HTMLInputElement).value);
		applyFilter('saturation', value);
	}

	function applyHue(event: Event) {
		const value = parseFloat((event.target as HTMLInputElement).value);
		applyFilter('hue', value);
	}

	function applyBlur(event: Event) {
		const value = parseFloat((event.target as HTMLInputElement).value);
		applyFilter('blur', value);
	}

	function toggleSepia(event: Event) {
		const value = (event.target as HTMLInputElement).checked;
		applyFilter('sepia', value);
	}

	function toggleInvert(event: Event) {
		const value = (event.target as HTMLInputElement).checked;
		applyFilter('invert', value);
	}

	function toggleGrayscale(event: Event) {
		const value = (event.target as HTMLInputElement).checked;
		applyFilter('grayscale', value);
	}

	// You can add more filter functions as needed
</script>

<div class="filter-controls">
	<label>
		Brighten:
		<input type="range" min="-1" max="1" step="0.1" on:input={applyBrighten} />
	</label>
	<label>
		Contrast:
		<input type="range" min="-100" max="100" step="1" on:input={applyContrast} />
	</label>
	<label>
		Saturation:
		<input type="range" min="-2" max="10" step="0.1" on:input={applySaturation} />
	</label>
	<label>
		Hue:
		<input type="range" min="0" max="360" step="1" on:input={applyHue} />
	</label>
	<label>
		Blur:
		<input type="range" min="0" max="40" step="1" on:input={applyBlur} />
	</label>
	<label>
		Sepia:
		<input type="checkbox" on:change={toggleSepia} />
	</label>
	<label>
		Invert:
		<input type="checkbox" on:change={toggleInvert} />
	</label>
	<label>
		Grayscale:
		<input type="checkbox" on:change={toggleGrayscale} />
	</label>
	<!-- Add more filter controls as needed -->
</div>

<style>
	.filter-controls {
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
