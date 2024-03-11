<script lang="ts">
	import WidgetBuilder from '@components/widgets/builder/WidgetBuilder.svelte';

	export let value: Array<Array<any>> = [];
	//console.log(value);
</script>

<div class="box-border flex w-[99%] flex-col items-center overflow-auto border p-2">
	<p>Menu Fields</p>

	<button on:click={() => (value = [...value, []])} class="variant-filled-primary btn"> Add Level </button>

	{#each value as level, index}
		<div class="m-3 border border-dashed border-white p-3 text-center">
			<p>level {index + 1}</p>
			<WidgetBuilder bind:fields={level} />
		</div>
	{/each}
</div>
