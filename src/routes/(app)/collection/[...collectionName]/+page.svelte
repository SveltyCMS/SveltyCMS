<script lang="ts">
	import axios from 'axios';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { obj2formData } from '@src/utils/utils';

	// Stores
	import { page } from '$app/stores';
	import { mode, collectionValue, permissionStore, tabSet } from '@stores/store';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Components
	import TopTabs from './tabs/TopTabs.svelte';
	import CollectionPermission from './tabs/CollectionPermission.svelte';
	import CollectionWidget from './tabs/CollectionWidget.svelte';
	import CollectionForm from './tabs/CollectionForm.svelte';
	import PageTitle from '@src/components/PageTitle.svelte';

	// Skeleton
	import { TabGroup, getToastStore } from '@skeletonlabs/skeleton';
	import { getModalStore, type ModalSettings } from '@skeletonlabs/skeleton';

	const modalStore = getModalStore();
	const toastStore = getToastStore();

	// Extract the collection name from the URL
	const collectionName = $page.params.collectionName;

	// Default widget data (tab1)
	let name = $mode == 'edit' ? ($collectionValue ? $collectionValue.name : collectionName) : collectionName;

	// Page title
	let pageTitle =
		$mode == 'edit'
			? `Edit <span class="text-tertiary-500 dark:text-primary-500">${collectionName} </span> Collection`
			: collectionName
				? `Create <span class="text-tertiary-500 dark:text-primary-500"> ${collectionName} </span> Collection`
				: `Create <span class="text-tertiary-500 dark:text-primary-500"> new </span> Collection`;

	function handlePageTitleUpdate(e: any) {
		pageTitle = e.detail;
	}

	// Function to save data by sending a POST request
	async function handleCollectionSave() {
		// Prepare form data
		let data =
			$mode == 'edit'
				? obj2formData({
						originalName: $collectionValue.name,
						collectionName: name,
						icon: $collectionValue.icon,
						status: $collectionValue.status,
						slug: $collectionValue.slug,
						description: $collectionValue.description,
						permissions: $permissionStore,
						fields: $collectionValue.fields
					})
				: obj2formData({
						collectionName: name,
						icon: $collectionValue.icon,
						status: $collectionValue.status,
						slug: $collectionValue.slug,
						description: $collectionValue.description,
						permissions: $permissionStore,
						fields: $collectionValue.fields
					});

		// Send the form data to the server
		let resp = await axios.post(`?/saveCollection`, data, {
			headers: {
				'Content-Type': 'multipart/form-data'
			}
		});

		if (resp.data.status === 200) {
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
	}

	function handleCollectionDelete() {
		console.log('Delete collection:', $collectionValue.name);
		// Define the confirmation modal
		const confirmModal: ModalSettings = {
			type: 'confirm',
			title: 'Please Confirm',
			body: 'Are you sure you wish to delete this collection?',
			response: (r: boolean) => {
				if (r) {
					// Send the form data to the server
					axios.post(`?/deleteCollections`, obj2formData({ collectionName: $collectionValue.name }), {
						headers: {
							'Content-Type': 'multipart/form-data'
						}
					});

					// Trigger the toast
					const t = {
						message: 'Collection Deleted.',
						// Provide any utility or variant background style:
						background: 'variant-filled-error',
						timeout: 3000,
						// Add your custom classes here:
						classes: 'border-1 !rounded-md'
					};
					toastStore.trigger(t);
					goto(`/collection`);
				} else {
					// User cancelled, do not delete
					console.log('User cancelled deletion.');
				}
			}
		};
		// Trigger the confirmation modal
		modalStore.trigger(confirmModal);
		// Close the modal
	}

	onMount(() => {
		// Set the initial tab
		tabSet.set(0);
	});
</script>

<div class="align-center mb-2 mt-2 flex w-full justify-between dark:text-white">
	<PageTitle name={pageTitle} icon="ic:baseline-build" />
</div>
{#if $mode == 'edit'}
	<div class="flex justify-end gap-3">
		<button
			type="button"
			on:click={handleCollectionDelete}
			class=" variant-filled-error btn mb-3 mr-1 mt-1 justify-end dark:variant-filled-error dark:text-black"
			>{m.button_delete()}
		</button>
		<button
			type="button"
			on:click={handleCollectionSave}
			class="variant-filled-tertiary btn mb-3 mr-1 mt-1 justify-end dark:variant-filled-tertiary dark:text-black">{m.button_save()}</button
		>
	</div>
{/if}

<div class="wrapper">
	<p class="mb-2 hidden text-center text-tertiary-500 dark:text-primary-500 sm:block">{m.collection_helptext()}</p>

	<TabGroup bind:group={$tabSet} justify="justify-between lg:justify-start">
		<TopTabs />

		<svelte:fragment slot="panel">
			{#if $tabSet === 0}
				<CollectionForm on:updatePageTitle={handlePageTitleUpdate} />
			{:else if $tabSet === 1}
				<CollectionPermission />
			{:else if $tabSet === 2}
				<CollectionWidget on:save={handleCollectionSave} />
			{/if}
		</svelte:fragment>
	</TabGroup>
</div>
