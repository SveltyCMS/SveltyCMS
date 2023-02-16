<script lang="ts">
	import collections, { categories } from '$src/collections';
	import EntryList from '$src/components/EntryList.svelte';
	import Form from '$src/components/Form.svelte';

	let toggleSideBar = true;
	let deleteMode: boolean;

	let collection = collections[0];
	let fields: any;
	let refresh: (collection: any) => Promise<any>;
	let showFields = false;
	let category = categories[0].category;
</script>

<div class="content !mt-[60px] flex-grow md:!mt-0 md:flex-grow-0">
	{#if showFields}
		<Form {fields} {collection} bind:showFields />
	{/if}
	protected route?
	<!-- <div hidden={showFields}>
		<EntryList
			bind:toggleSideBar
			bind:showFields
			bind:deleteMode
			{collection}
			{category}
			bind:refresh
		/>
	</div> -->
</div>
