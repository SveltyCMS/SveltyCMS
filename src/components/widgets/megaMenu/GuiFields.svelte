<script lang="ts">
	import WidgetBuilder from '@src/routes/(app)/builder/WidgetBuilder.svelte';

	export let value: Array<Array<any>> = [];
	//console.log(value);
</script>

<div class="container border p-2">
	<p>Menu Fields</p>
	<button on:click={() => (value = [...value, []])} class="variant-filled-primary btn">Add Level</button>
	{#each value as level, index}
		<div class="level">
			<p>level {index + 1}</p>
			<WidgetBuilder fields={level}/>
		</div>
	{/each}
</div>

<style lang="postcss">
	.container {
		color: white;
		width: 99%;
		display: flex;
		flex-direction: column;
		align-items: center;
		box-sizing: border-box;
		overflow: auto;
	}

	.level {
		text-align: center;
		border: 1px dashed white;
		padding: 15px;
		margin: 10px;
	}
</style>
