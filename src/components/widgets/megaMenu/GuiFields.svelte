<script lang="ts">
	import WidgetBuilder from '@src/routes/(app)/builder/WidgetBuilder.svelte';

	export let value: Array<Array<any>> = [];
	//console.log(value);
</script>

<div class="w-full flex flex-col items-center box-border border p-2">
	<p>Menu Fields</p>

	<button on:click={() => (value = [...value, []])} 
		class="variant-filled-primary btn">
		Add Level
	</button>
	
	{#each value as level, index}
		<div class="text-center p-3 m-2 border border-dashed">
			<p>level {index + 1}</p>
			<WidgetBuilder fields={level}/>
		</div>
	{/each}

</div>


