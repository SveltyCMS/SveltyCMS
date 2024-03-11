<script>
	import AddWidget from './AddWidget.svelte';
	import WidgetFields from './WidgetFields.svelte';
	export let addField = false;
	export let fields = [];

	//ParaglideJS
	import * as m from '@src/paraglide/messages';
</script>

<div class="flex flex-col">
	{#if addField}
		<AddWidget {fields} bind:addField />
	{:else}
		<button class="variant-filled-tertiary btn mb-4 mt-1 dark:variant-filled-primary" on:click={() => (addField = true)}>
			{m.WidgetBuilder_AddColectionField()}
		</button>
		<WidgetFields bind:fields />
	{/if}
</div>
