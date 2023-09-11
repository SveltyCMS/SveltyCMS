<script>
	import AddWidget from './AddWidget.svelte';
	import WidgetFields from './WidgetFields.svelte';
	export let addField = false;
	export let fields = [];
</script>

<div class="flex flex-col">
	{#if addField}
		<AddWidget {fields} bind:addField />
	{:else}
		<button class="btn text-primary-500" on:click={() => (addField = true)}>Add Field</button>
		<WidgetFields {fields} />
	{/if}
</div>
