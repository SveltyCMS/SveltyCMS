<script lang="ts">
	import collections, { categories } from '$src/collections';
	import EntryList from '$src/components/EntryList.svelte';
	import Form from '$src/components/Form.svelte';
	import widgets from '$src/components/widgets';
	import showFieldsStore from '$src/lib/stores/fieldStore';
	import { shape_fields } from '$src/lib/utils/utils_svelte';
	import { onMount } from 'svelte';

	let toggleSideBar = true;
	let deleteMode: boolean;

	let collection = collections[0];
	let fields: any;
	let category: any;
	let category_name: string;
	let refresh: (collection: any) => Promise<any>;

	$: if (
		$showFieldsStore.category_index !== null &&
		$showFieldsStore.collection_index !== null &&
		$showFieldsStore.showField
	) {
		category = categories[$showFieldsStore.category_index];
		category_name = category.category;
		collection = category.collections[$showFieldsStore.collection_index];
		(async () => {
			fields = await shape_fields(collection.fields);
		})();
	}

	// initial show first collection
	onMount(async () => {
		$showFieldsStore = {
			category_index: 0,
			collection_index: 0,
			showField: true
		};
	});
</script>

{#if $showFieldsStore.showField}
	<EntryList
		bind:deleteMode
		{fields}
		{collection}
		category={category_name}
		bind:showFields={$showFieldsStore.showField}
		bind:refresh
	/>
{/if}
