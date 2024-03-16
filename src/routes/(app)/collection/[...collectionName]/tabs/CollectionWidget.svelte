<script lang="ts">
	import axios from 'axios';
	import { page } from '$app/stores';
	import { mode, currentCollection, tabSet, permissionStore } from '@stores/store';
	import type { ModalSettings, ModalComponent } from '@skeletonlabs/skeleton';
	import { getToastStore, getModalStore } from '@skeletonlabs/skeleton';
	import VerticalList from '@components/VerticalList.svelte';
	import ModalWidgetForm from '@src/routes/(app)/collection/[...collectionName]/ModalWidgetForm.svelte';
	import ModalSelectWidget from '@src/routes/(app)/collection/[...collectionName]/ModalSelectWidget.svelte';
	import { obj2formData } from '@src/utils/utils';
	import * as m from '@src/paraglide/messages';

	// Skeleton
	const toastStore = getToastStore();
	const modalStore = getModalStore();

	// Extract the collection name from the URL
	const collectionName = $page.params.collectionName;

	//fields
	let icon = $mode == 'edit' ? $currentCollection.icon : '';
	let slug = $mode == 'edit' ? $currentCollection.slug : name;
	let description = $mode == 'edit' ? $currentCollection.description : '';
	let status = $mode == 'edit' ? $currentCollection.status : 'unpublished';
	let fields =
		$mode == 'edit'
			? $currentCollection.fields.map((field, index) => {
					return {
						id: index + 1, // Add the id property first
						...field // Copy all existing properties
					};
				})
			: [];

	// Collection headers
	const headers = ['Id', 'Icon', 'Name', 'DBName', 'Widget'];

	// svelte-dnd-action
	const flipDurationMs = 300;

	const handleDndConsider = (e: any) => {
		fields = e.detail.items;
	};

	const handleDndFinalize = (e: any) => {
		fields = e.detail.items;
	};

	// Modal 2 to Edit a selected widget
	function modalWidgetForm(selectedWidget: any): void {
		const c: ModalComponent = { ref: ModalWidgetForm };
		const modal: ModalSettings = {
			type: 'component',
			component: c,
			title: 'Define your Widget',
			body: 'Setup your widget and then press Save.',
			value: selectedWidget, // Pass the selected widget	as the initial value
			response: (r: any) => {
				// console.log('response modalWidgetForm:', r);
				// console.log('fields old:', fields);

				// Find the index of the existing widget based on its ID
				const existingIndex = fields.findIndex((widget) => widget.id === r.id);

				if (existingIndex !== -1) {
					// If the existing widget is found, update its properties
					fields = [
						...fields.slice(0, existingIndex), // Copy widgets before the updated one
						{ ...r }, // Update the existing widget
						...fields.slice(existingIndex + 1) // Copy widgets after the updated one
					];
				} else {
					// If the existing widget is not found, add it as a new widget
					fields = [
						...fields,
						{
							id: fields.length + 1,
							...r
						}
					];
				}

				// console.log('fields new:', fields);
			}
		};
		modalStore.trigger(modal);
	}

	// Modal 1 to choose a widget
	function modalSelectWidget(selected: any): void {
		const c: ModalComponent = { ref: ModalSelectWidget };
		const modal: ModalSettings = {
			type: 'component',
			component: c,
			title: 'Select a Widget',
			body: 'Select your widget and then press submit.',
			value: selected, // Pass the selected widget as the initial value
			response: (r: any) => {
				// console.log('response modalSelectWidget:', r);
				const { selectedWidget } = r;
				modalWidgetForm(selectedWidget); // Use selectedWidget directly
			}
		};
		modalStore.trigger(modal);
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
		axios.post(`?/saveCollection`, data, {
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

<div class="variant-outline-primary rounded-t-md p-2 text-center">
	<p>
		{m.collection_widgetfield_addrequired()} <span class="text-primary-500">{collectionName}</span> Collection inputs.
	</p>
	<p class="mb-2">{m.collection_widgetfield_drag()}</p>
</div>

<!--dnd vertical row -->
<VerticalList items={fields} {headers} {flipDurationMs} {handleDndConsider} {handleDndFinalize}>
	{#each fields as field (field.id)}
		<div
			class="border-blue variant-outline-surface my-2 grid w-full grid-cols-6 items-center rounded-md border p-1 text-left hover:variant-filled-surface dark:text-white"
		>
			<div class="variant-ghost-primary btn-icon">
				{field.id}
			</div>
			<!-- TODO: display the icon from guischema widget-->
			<iconify-icon {icon} width="24" class="text-tertiary-500" />
			<div class="font-bold dark:text-primary-500">{field.label}</div>
			<div class=" ">{field?.db_fieldName ? field.db_fieldName : '-'}</div>
			<div class=" ">{field?.key}</div>

			<button type="button" class="variant-ghost-primary btn-icon ml-auto" on:click={() => modalWidgetForm(field)}>
				<iconify-icon icon="ic:baseline-edit" width="24" class="dark:text-white" />
			</button>
		</div>
	{/each}
</VerticalList>

<div class="mt-2 flex items-center justify-center gap-3">
	<button on:click={modalSelectWidget} class="variant-filled-tertiary btn">{m.collection_widgetfield_addFields()} </button>
</div>

<div class=" flex items-center justify-between">
	<button type="button" on:click={() => ($tabSet = 1)} class="variant-filled-secondary btn mt-2 justify-end">{m.button_previous()}</button>
	<button
		type="button"
		on:click={handleCollectionSave}
		class="variant-filled-tertiary btn mt-2 justify-end dark:variant-filled-primary dark:text-black">{m.button_save()}</button
	>
</div>
