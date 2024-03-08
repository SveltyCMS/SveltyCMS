<script lang="ts">
	import { RangeSlider } from '@skeletonlabs/skeleton';

	export let value;
</script>

<label class="label" for="range-slider">
	<span>Rating</span>
	<RangeSlider name="range-slider" id="range-slider" bind:value max={value.max} step={0.5} ticked class="w-full" />
</label>
