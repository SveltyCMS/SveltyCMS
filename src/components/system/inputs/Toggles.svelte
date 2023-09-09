<script lang="ts">
	import { SlideToggle } from '@skeletonlabs/skeleton';

	export let value: boolean = false;
	export let label: string = '';
</script>

<div class="inline-block gap-2">
	{label}
	<SlideToggle name="slide" bind:checked={value} />
</div>
