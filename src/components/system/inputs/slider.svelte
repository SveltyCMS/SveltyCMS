<!-- 
@file src/components/system/inputs/slider.svelte
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
	let {
		value = $bindable({
			max: 100,
			current: 0
		}),
		onChange
	} = $props<{
		value?: {
			max: number;
			current: number;
		};
		onChange?: (value: number) => void;
	}>();

	function handleInput(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const nextValue = Number(input.value);

		value.current = nextValue;
		onChange?.(nextValue);
	}
</script>

<label class="label" for="range-slider">
	<span>Rating</span>

	<input
		id="range-slider"
		name="range-slider"
		type="range"
		min="0"
		max={value.max}
		step="0.5"
		bind:value={value.current}
		oninput={handleInput}
		class="w-full accent-primary-500"
		aria-label="Rating"
		aria-valuemin="0"
		aria-valuemax={value.max}
		aria-valuenow={value.current}
	/>
</label>