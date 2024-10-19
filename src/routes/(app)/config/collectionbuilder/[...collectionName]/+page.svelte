<!-- 
@files src/routes/(app)/config/collectionbuilder/[...collectionName]/+page.svelte
@description  This component sets up and displays the collection page. It provides a user-friendly interface for creating, editing, and deleting collections.
-->
<script lang="ts">
	import axios from 'axios';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	import { obj2formData } from '@utils/utils';

	// Stores
	import { page } from '$app/stores';
	import { tabSet } from '@stores/store';
	import { mode, collectionValue } from '@stores/collectionStore';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Components
	import CollectionWidget from './tabs/CollectionWidget.svelte';
	import CollectionForm from './tabs/CollectionForm.svelte';
	import PageTitle from '@components/PageTitle.svelte';

	// Skeleton
	import { Tab, TabGroup, getToastStore } from '@skeletonlabs/skeleton';
	import { getModalStore, type ModalSettings } from '@skeletonlabs/skeleton';

	const modalStore = getModalStore();
	const toastStore = getToastStore();

	// Extract the collection name from the URL
	const collectionName = $page.params.collectionName;

	// Default widget data (tab1)
	const name = $mode == 'edit' ? ($collectionValue ? $collectionValue.name : collectionName) : collectionName;

	// Page title
	let pageTitle: string;
	let highlightedPart: string;

	$: {
		if ($mode === 'edit') {
			pageTitle = `Edit ${collectionName} Collection`;
		} else if (collectionName) {
			pageTitle = `Create ${collectionName} Collection`;
		} else {
			pageTitle = 'Create new Collection';
		}
		highlightedPart = collectionName || 'new';
	}

	function handlePageTitleUpdate(e: CustomEvent<string>) {
		highlightedPart = e.detail;
		if ($mode === 'edit') {
			pageTitle = `Edit ${highlightedPart} Collection`;
		} else {
			pageTitle = `Create ${highlightedPart} Collection`;
		}
	}

	// Function to save data by sending a POST request
	async function handleCollectionSave() {
		// Delete key from fields
		$collectionValue.fields.forEach((field: any) => {
			delete field.key;
		});

		// Prepare form data
		const data =
			$mode == 'edit'
				? obj2formData({
						originalName: $collectionValue.name,
						collectionName: name,
						icon: $collectionValue.icon,
						status: $collectionValue.status,
						slug: $collectionValue.slug,
						description: $collectionValue.description,
						permissions: $collectionValue.permissions,
						fields: $collectionValue.fields
					})
				: obj2formData({
						collectionName: name,
						icon: $collectionValue.icon,
						status: $collectionValue.status,
						slug: $collectionValue.slug,
						description: $collectionValue.description,
						permissions: $collectionValue.permissions,
						fields: $collectionValue.fields
					});

		// Send the form data to the server
		const resp = await axios.post(`?/saveCollection`, data, {
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

<!-- Page Title -->
<div class="my-2 flex items-center justify-between gap-2">
	<PageTitle name={pageTitle} highlight={highlightedPart} icon="ic:baseline-build" />

	<!-- Back -->
	<button on:click={() => history.back()} class="variant-outline-primary btn-icon">
		<iconify-icon icon="ri:arrow-left-line" width="20" />
	</button>
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

	<TabGroup bind:group={$tabSet} justify="justify-around">
		<!-- User Permissions -->
		{#if $page.data.user && $page.data.user.isAdmin}
			<!-- Edit -->
			<Tab bind:group={$tabSet} name="default" value={0}>
				<div class="flex items-center gap-1">
					<iconify-icon icon="ic:baseline-edit" width="24" class="text-tertiary-500 dark:text-primary-500" />
					<span class:active={$tabSet === 0} class:text-tertiary-500={$tabSet === 0} class:text-primary-500={$tabSet === 0}>{m.button_edit()}</span>
				</div>
			</Tab>

			<!-- Widget Fields -->
			<Tab bind:group={$tabSet} name="widget" value={1}>
				<div class="flex items-center gap-1">
					<iconify-icon icon="mdi:widgets-outline" width="24" class="text-tertiary-500 dark:text-primary-500" />
					<span class:active={$tabSet === 1} class:text-tertiary-500={$tabSet === 2} class:text-primary-500={$tabSet === 2}
						>{m.collection_widgetfields()}</span
					>
				</div>
			</Tab>
		{/if}

		<svelte:fragment slot="panel">
			{#if $tabSet === 0}
				<CollectionForm on:updatePageTitle={handlePageTitleUpdate} />
			{:else if $tabSet === 1}
				<CollectionWidget on:save={handleCollectionSave} />
			{/if}
		</svelte:fragment>
	</TabGroup>
</div>
