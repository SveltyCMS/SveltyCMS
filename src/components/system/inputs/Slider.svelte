<!-- 
@file src/components/system/inputs/Slider.svelte
@component
**Range slider component with customizable value and max range**

@example
<Slider bind:value={value} onChange={handleValueChange} />

### Props:
- `value` {any} - Bindable value
- `onChange` {function} - Function to handle value change

### Features:
- Customizable value range
- Step-based increments
- Visual tick marks
- Accessible input
-->

<script lang="ts">
	import { Slider } from '@skeletonlabs/skeleton-svelte';

	let {
		value = $bindable({
			max: 100,
			current: 0
		}),
		onChange
	} = $props<{
		value?: {
			max: number; // Maximum value for the slider
			current: number; // Current selected value
		};
		onChange?: (value: number) => void; // Callback when value changes
	}>();

	// Function to handle value changes
	function handleChange(event: Event) {
		const customEvent = event as CustomEvent<number>;
		value.current = customEvent.detail;
		onChange?.(customEvent.detail);
	}
</script>

<label class="label" for="range-slider">
	<span>Rating</span>
	<Slider {value} onValueChange={(e) => (value = e.value)} markers={[25, 50, 75]} />

	<!-- <Slider
		name="range-slider"
		id="range-slider"
		value={value.current}
		on:change={handleChange}
		max={value.max}
		step={0.5}
		ticked
		class="w-full"
	/> -->
</label>
