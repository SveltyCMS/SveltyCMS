<!--
@file src/components/system/builder/FieldPicker.svelte
@description Component for selecting a field from the fields of a selected collection
-->

<script lang="ts">
	import { collections } from '@stores/collectionStore.svelte';

	interface Props {
		value?: string;
		collection?: string;
	}

	let { value = $bindable(''), collection = '' }: Props = $props();

	// Get fields for the selected collection
	let selectedCollection = $derived(Object.values(collections.value).find((c) => c.name === collection));
	let fieldNames = $derived(selectedCollection?.fields?.map((f: any) => (f as any).db_fieldName).filter(Boolean) || []);
</script>

<div class="m-1 flex max-w-full items-center justify-between gap-2">
	<label for="field-select" class="w-32 flex-none">Display Field</label>
	<select id="field-select" class="input grow text-black dark:text-primary-500" bind:value disabled={!collection}>
		<option value="">Select a field</option>
		{#each fieldNames as name}
			<option value={name}>{name}</option>
		{/each}
	</select>
</div>
