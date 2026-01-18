<!--
@file src/components/WatermarkSettings.svelte
@component
**Enhanced WatermarkSettings component for CMS integration**

Features:
- Adjusts watermark size, opacity, position, and rotation
- Improved accessibility with aria-labels
- Responsive grid layout for controls

Usage:
<WatermarkSettings bind:size bind:opacity bind:positionX bind:positionY bind:rotation />
-->

<script lang="ts">
	interface Props {
		// Export props for external binding
		size?: string;
		opacity?: number;
		positionX?: number;
		positionY?: number;
		rotation?: number;
	}

	let {
		size = $bindable('100%'),
		opacity = $bindable(1),
		positionX = $bindable(0),
		positionY = $bindable(0),
		rotation = $bindable(0)
	}: Props = $props();

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
			oninput={handleSizeChange}
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
			oninput={handleOpacityChange}
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
			oninput={handlePositionXChange}
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
			oninput={handlePositionYChange}
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
			oninput={handleRotationChange}
			aria-label="Watermark rotation in degrees"
		/>
	</div>
</div>
