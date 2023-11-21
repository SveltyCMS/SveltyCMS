<script lang="ts">
	import WidgetBuilder from '@src/routes/(app)/builder/WidgetBuilder.svelte';

	export let value: Array<Array<any>> = [];
	//console.log(value);
</script>

<div class="box-border flex w-full flex-col items-center overflow-auto border p-2">
	<p>Menu Fields</p>

	<button on:click={() => (value = [...value, []])} class="variant-filled-primary btn"> Add Level </button>

	{#each value as level, index}
		<div class="level">
			<p>level {index + 1}</p>
			<WidgetBuilder fields={level} />
		</div>
	{/each}
</div>
