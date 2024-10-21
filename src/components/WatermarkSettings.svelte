<!--
@file src/components/WatermarkSettings.svelte
@description Enhanced WatermarkSettings component for CMS integration

Features:
- Adjusts watermark size, opacity, position, and rotation
- Improved accessibility with aria-labels
- Responsive grid layout for controls

Usage:
<WatermarkSettings bind:size bind:opacity bind:positionX bind:positionY bind:rotation />
-->

<script lang="ts">
	// Export props for external binding
	export let size = '100%';
	export let opacity = 1;
	export let positionX = 0;
	export let positionY = 0;
	export let rotation = 0;

	// Handle size input change
	function handleSizeChange(event: Event) {
		const target = event.target as HTMLInputElement;
		size = target.value;
	}

	// Handle opacity input change
	function handleOpacityChange(event: Event) {
		const target = event.target as HTMLInputElement;
		opacity = parseFloat(target.value);
	}

	// Handle X position input change
	function handlePositionXChange(event: Event) {
		const target = event.target as HTMLInputElement;
		positionX = parseInt(target.value, 10);
	}

	// Handle Y position input change
	function handlePositionYChange(event: Event) {
		const target = event.target as HTMLInputElement;
		positionY = parseInt(target.value, 10);
	}

	// Handle rotation input change
	function handleRotationChange(event: Event) {
		const target = event.target as HTMLInputElement;
		rotation = parseInt(target.value, 10);
	}
</script>

<div class="grid grid-cols-2 gap-2">
	<div>
		<label class="block font-bold" for="size">Size</label>
		<input
			class="w-full"
			id="size"
			type="text"
			bind:value={size}
			on:input={handleSizeChange}
			placeholder="e.g., 100px or 50%"
			aria-label="Watermark size"
		/>
	</div>
	<div>
		<label class="block font-bold" for="opacity">Opacity</label>
		<input
			class="w-full"
			id="opacity"
			type="range"
			min="0"
			max="1"
			step="0.1"
			bind:value={opacity}
			on:input={handleOpacityChange}
			aria-label="Watermark opacity"
		/>
	</div>
	<div>
		<label class="block font-bold" for="positionX">Position X</label>
		<input
			class="w-full"
			id="positionX"
			type="number"
			bind:value={positionX}
			on:input={handlePositionXChange}
			aria-label="Watermark horizontal position"
		/>
	</div>
	<div>
		<label class="block font-bold" for="positionY">Position Y</label>
		<input
			class="w-full"
			id="positionY"
			type="number"
			bind:value={positionY}
			on:input={handlePositionYChange}
			aria-label="Watermark vertical position"
		/>
	</div>
	<div>
		<label class="block font-bold" for="rotation">Rotation</label>
		<input
			class="w-full"
			id="rotation"
			type="number"
			bind:value={rotation}
			on:input={handleRotationChange}
			aria-label="Watermark rotation in degrees"
		/>
	</div>
</div>
