<script lang="ts">
	// RangeSlider compat component
	interface Props {
		name?: string;
		value?: number;
		min?: number;
		max?: number;
		step?: number;
		[key: string]: any;
	}
	
	let { name = 'range', value = $bindable(50), min = 0, max = 100, step = 1, ...rest }: Props = $props();
</script>

<input type="range" {name} bind:value {min} {max} {step} class="range-slider w-full" {...rest} />
