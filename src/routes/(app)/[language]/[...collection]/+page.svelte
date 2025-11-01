<!--
@file src/routes/(app)/[language]/[...collection]/+page.svelte
@component
**This component acts as a layout and data router for the collection view.**

## Features:
- Receives all page data (schema, entries, pagination) from the server-side `load` function.
- Passes server-loaded data as props to the `EntryList` or `Fields` components.
- Does not perform any client-side data fetching.
-->
<script lang="ts">
	import { collection, mode, setCollection } from '@src/stores/collectionStore.svelte';
	import EntryList from '@src/components/collectionDisplay/EntryList.svelte';
	import Fields from '@src/components/collectionDisplay/Fields.svelte';
	import Loading from '@src/components/Loading.svelte';
	import type { Schema } from '@src/content/types';

	interface PageData {
		collectionSchema: Schema;
		entries: any[];
		pagination: {
			totalItems: number;
			pagesCount: number;
			currentPage: number;
			pageSize: number;
		};
		revisions: any[];
	}

	let { data }: { data: PageData } = $props();

	// Use $derived for reactivity from server-loaded data
	let collectionSchema = $derived(data?.collectionSchema);
	let entries = $derived(data?.entries || []);
	let pagination = $derived(data?.pagination || { currentPage: 1, pageSize: 10, totalItems: 0, pagesCount: 1 });
	let revisions = $derived(data?.revisions || []);

	// This effect runs when SvelteKit provides new data from the `load` function
	$effect(() => {
		if (collectionSchema) {
			// Set the global store with the fresh data loaded from the server
			setCollection(collectionSchema);
		}
	});
</script>

<svelte:head>
	<title>{collectionSchema?.name ?? 'Collection'} - SveltyCMS</title>
</svelte:head>

<div class="content h-full">
	{#if !collection.value}
		<!-- This should only flash briefly on first load -->
		<Loading />
	{:else if mode.value === 'view' || mode.value === 'modify'}
		<!-- Pass the server-loaded data directly as props -->
		<EntryList {entries} {pagination} />
	{:else if ['edit', 'create'].includes(mode.value)}
		<div id="fields_container" class="fields max-h-[calc(100vh-100px)] overflow-y-auto max-md:max-h-[calc(100vh-120px)]">
			<!-- Pass the server-loaded data directly as props -->
			<Fields fields={collection.value.fields} {revisions} />
		</div>
	{/if}
</div>
