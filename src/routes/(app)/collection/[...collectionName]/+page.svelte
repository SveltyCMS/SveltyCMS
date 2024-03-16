<script lang="ts">
	import axios from 'axios';
	import { page } from '$app/stores';
	import { permissionStore, tabSet } from '@stores/store';
	import { mode, currentCollection } from '@stores/store';
	import { TabGroup } from '@skeletonlabs/skeleton';
	import * as m from '@src/paraglide/messages';
	import { getToastStore } from '@skeletonlabs/skeleton';
	import TopTabs from './tabs/TopTabs.svelte';
	import CollectionPermission from './tabs/CollectionPermission.svelte';
	import CollectionWidget from './tabs/CollectionWidget.svelte';
	import CollectionForm from './tabs/CollectionForm.svelte';
	import PageTitle from '@src/components/PageTitle.svelte';
	import { obj2formData } from '@src/utils/utils';

	const toastStore = getToastStore();
	// Extract the collection name from the URL
	const collectionName = $page.params.collectionName;

	// Default widget data (tab1)
	let name = $mode == 'edit' ? ($currentCollection ? $currentCollection.name : collectionName) : collectionName;
	let icon = '';
	let slug = '';
	let description = '';
	let fields = [];

	// Page title
	let pageTitle =
		$mode == 'edit'
			? `Edit <span class="text-primary-500">${collectionName} </span> Collection`
			: collectionName
				? `Create <span class="text-primary-500"> ${collectionName} </span> Collection`
				: `Create <span class="text-primary-500"> new </span> Collection`;

	function handlePageTitleUpdate(e) {
		pageTitle = e.detail;
	}

	// Function to save data by sending a POST request
	function handleCollectionSave() {
		// Prepare form data
		let data =
			$mode == 'edit'
				? obj2formData({
						originalName: $currentCollection.name,
						collectionName: name,
						icon: $currentCollection.icon,
						status: $currentCollection.status,
						slug: $currentCollection.slug,
						description: $currentCollection.description,
						permissions: $permissionStore,
						fields: $currentCollection.fields
					})
				: obj2formData({ fields, permissionStore, collectionName: name, icon, slug, description, status });

		// console.log(data);

		// Send the form data to the server
		axios.post(`?/saveCollections`, data, {
			headers: {
				'Content-Type': 'multipart/form-data'
			}
		});

		// Trigger the toast
		const t = {
			message: "Collection Saved. You're all set to build your content.",
			// Provide any utility or variant background style:
			background: 'variant-filled-primary',
			timeout: 3000,
			// Add your custom classes here:
			classes: 'border-1 !rounded-md'
		};
		toastStore.trigger(t);
	}
</script>

<div class="align-center mb-2 mt-2 flex w-full justify-between dark:text-white">
	<PageTitle name={pageTitle} icon="ic:baseline-build" />
	{#if ($mode = 'edit')}
		<button
			type="button"
			on:click={handleCollectionSave}
			class="variant-filled-tertiary btn mb-3 mr-1 mt-1 justify-end dark:variant-filled-primary dark:text-black">Save</button
		>
	{/if}
</div>

<div class="wrapper">
	<p class="mb-2 hidden text-center text-tertiary-500 dark:text-primary-500 sm:block">{m.collection_helptext()}</p>

	<TabGroup bind:group={$tabSet}>
		<TopTabs />

		<svelte:fragment slot="panel">
			{#if $tabSet === 0}
				<CollectionForm on:updatePageTitle={handlePageTitleUpdate} />
			{:else if $tabSet === 1}
				<CollectionPermission />
			{:else if $tabSet === 2}
				<CollectionWidget />
			{/if}
		</svelte:fragment>
	</TabGroup>
</div>
