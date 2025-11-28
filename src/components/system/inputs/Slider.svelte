<!-- 
@file src/components/system/inputs/Slider.svelte
@component
**Range slider component with customizable value and max range**

### Props
- `value`: { max: number; current: number } - Object containing the maximum value
- `onChange`: (value: number) => void - Callback function when value changes

### Features:
- Customizable maximum value
- Current value tracking
- Change event handling
-->

<script lang="ts">
	import { RangeSlider } from '@skeletonlabs/skeleton';

	let {
		value = $bindable({
			max: 100,
			current: 0
		}),
		onChange
	} = $props(); // Maximum value for the slider
	// Current selected value
	// Callback when value changes

	// Function to handle value changes
	function handleChange(event: Event) {
		const customEvent = event as CustomEvent;
		value.current = customEvent.detail;
		onChange?.(customEvent.detail);
	}
</script>

<label class="label" for="range-slider">
	<span>Rating</span>
	<RangeSlider
		name="range-slider"
		id="range-slider"
		value={value.current}
		on:change={handleChange}
		max={value.max}
		step={0.5}
		ticked
		class="w-full"
	/>
</label>
