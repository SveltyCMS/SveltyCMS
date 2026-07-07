<!--
@file src/components/watermark-settings.svelte
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
	import Input from '@components/ui/input.svelte';
	import Slider from '@components/ui/slider.svelte';

	interface Props {
		opacity?: number;
		positionX?: number;
		positionY?: number;
		rotation?: number;
		// Export props for external binding
		size?: string;
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

	// Handle opacity slider change (Slider passes number, not Event)
			function handleOpacityChange(value: number) {
				opacity = value;
			}

	// Handle X position input change
	function handlePositionXChange(event: Event) {
		const target = event.target as HTMLInputElement;
		positionX = Number.parseInt(target.value, 10);
	}

	// Handle Y position input change
	function handlePositionYChange(event: Event) {
		const target = event.target as HTMLInputElement;
		positionY = Number.parseInt(target.value, 10);
	}

	// Handle rotation input change
	function handleRotationChange(event: Event) {
		const target = event.target as HTMLInputElement;
		rotation = Number.parseInt(target.value, 10);
	}
</script>

	<div class="grid grid-cols-2 gap-2">
		<div>
			<label class="block font-bold" for="size">Size</label>
			<Input
				aria-label="Watermark size"
				type="text"
				class="w-full"
				id="size"
				bind:value={size}
				oninput={handleSizeChange}
				placeholder="e.g., 100px or 50%"
			/>
		</div>
		<div>
			<label class="block font-bold" for="opacity">Opacity</label>
			<Slider
				aria-label="Watermark opacity"
				class="w-full"
				min={0}
				max={1}
				step={0.1}
				bind:value={opacity}
				onchange={handleOpacityChange}
			/>
		</div>
		<div>
			<label class="block font-bold" for="positionX">Position X</label>
			<Input
				aria-label="Position X"
				type="number"
				class="w-full"
				id="positionX"
				bind:value={positionX}
				oninput={handlePositionXChange}
			/>
		</div>
		<div>
			<label class="block font-bold" for="positionY">Position Y</label>
			<Input
				aria-label="Position Y"
				type="number"
				class="w-full"
				id="positionY"
				bind:value={positionY}
				oninput={handlePositionYChange}
			/>
		</div>
		<div>
			<label class="block font-bold" for="rotation">Rotation</label>
			<Input
				aria-label="Rotation"
				type="number"
				class="w-full"
				id="rotation"
				bind:value={rotation}
				oninput={handleRotationChange}
			/>
		</div>
	</div>
