<script lang="ts">
	import { RangeSlider } from '@skeletonlabs/skeleton';

	export let value;
</script>

<label class="label">
	<span>Rating</span>
	<RangeSlider name="range-slider" bind:value max={value.max} step={0.5} ticked class="w-full" />
</label>
