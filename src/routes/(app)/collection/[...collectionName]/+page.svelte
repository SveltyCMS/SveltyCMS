<script lang="ts">
	import PageTitle from '@components/PageTitle.svelte';
	import Permissions from '@components/Permissions.svelte';
	import { page } from '$app/stores';
	import { mode, collection, collections, permissionStore } from '@stores/store';
	import VerticalList from '@components/VerticalList.svelte';
	import IconifyPicker from '@components/IconifyPicker.svelte';
	import { obj2formData } from '@utils/utils';
	import axios from 'axios';
	import type { Schema } from '@collections/types';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Extract the collection name from the URL
	const collectionName = $page.params.collectionName;

	//check if collection Name exists set mode edit or create
	if ($collections.find((x) => x.name === collectionName)) {
		mode.set('edit');
		collection.set($collections.find((x) => x.name === collectionName) as Schema); // current collection
	} else {
		mode.set('create');
	}

	// Default widget data (tab1)
	let name = $mode == 'edit' ? $collection.name : collectionName;
	let icon = $mode == 'edit' ? $collection.icon : '';
	let slug = $mode == 'edit' ? $collection.slug : name;
	let description = $mode == 'edit' ? $collection.description : '';
	let status = $mode == 'edit' ? $collection.status : 'unpublished';

	// Widget Permissions (tab2)
	let permissions = $mode == 'edit' ? $collection.permissions : [];
	console.log('permissions:', permissions);

	// Widget fields data(tab3)
	let fields =
		$mode == 'edit'
			? $collection.fields.map((field, index) => {
					return {
						id: index + 1, // Add the id property first
						...field // Copy all existing properties
					};
				})
			: [];
	console.log('fields:', fields);

	// Form fields
	let DBName = '';
	let searchQuery = '';
	let iconselected: any = icon || '';
	const statuses = ['published', 'unpublished', 'draft', 'schedule', 'cloned'];
	let autoUpdateSlug = true;

	// Skeleton
	import { getToastStore, TabGroup, Tab, getModalStore, popup } from '@skeletonlabs/skeleton';
	const toastStore = getToastStore();
	import type { ModalSettings, ModalComponent, PopupSettings } from '@skeletonlabs/skeleton';
	const modalStore = getModalStore();

	// Import Modals
	import ModalSelectWidget from './ModalSelectWidget.svelte';
	import ModalWidgetForm from './ModalWidgetForm.svelte';

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
				console.log('response modalSelectWidget:', r);
				const { selectedWidget } = r;
				modalWidgetForm(selectedWidget); // Use selectedWidget directly
			}
		};
		modalStore.trigger(modal);
	}

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
				console.log('response modalWidgetForm:', r);
				console.log('fields old:', fields);

				// add responds to the fields array and add new ID
				fields = [
					...fields,
					{
						id: fields.length + 1,
						...r
					}
				];

				console.log('fields new:', fields);
			}
		};
		modalStore.trigger(modal);
	}

	// Popup Tooltips
	let NameTooltip: PopupSettings = {
		event: 'hover',
		target: 'Name',
		placement: 'right'
	};
	let IconTooltip: PopupSettings = {
		event: 'hover',
		target: 'Icon',
		placement: 'right'
	};
	let SlugTooltip: PopupSettings = {
		event: 'hover',
		target: 'Slug',
		placement: 'right'
	};
	let DescriptionTooltip: PopupSettings = {
		event: 'hover',
		target: 'Description',
		placement: 'right'
	};
	let StatusTooltip: PopupSettings = {
		event: 'hover',
		target: 'Status',
		placement: 'right'
	};

	// Page Title
	$: pageTitle =
		$mode == 'edit'
			? `Edit <span class="text-primary-500">${collectionName} </span> Collection`
			: collectionName
				? `Create <span class="text-primary-500"> ${collectionName} </span> Collection`
				: `Create <span class="text-primary-500"> new </span> Collection`;

	let tabSet: number = 0;

	function handleNameInput() {
		if (name) {
			// Update the URL
			window.history.replaceState({}, '', `/collection/${name}`);

			// Update the page title
			pageTitle = `Create <span class="text-primary-500"> ${name} </span> Collection`;

			// Update the linked slug input
			slug = name.toLowerCase().replace(/\s+/g, '_');

			// Call the `onSlugInput` function to update the slug variable
			onSlugInput();
		}
	}

	// TODO: Fix slug change
	function onSlugInput() {
		// Update the slug field whenever the name field is changed
		if (name) {
			slug = name.toLowerCase().replace(/\s+/g, '_');
		}
		// Disable automatic slug updates
		autoUpdateSlug = false;
	}

	$: {
		// Update DBName  lowercase and replace Spaces
		DBName = collectionName.toLowerCase().replace(/ /g, '_');

		// Automatically update slug when name changes
		if (autoUpdateSlug) {
			slug = collectionName.toLowerCase().replace(/\s+/g, '_');
		}
	}

	// Collection headers
	const headers = ['Id', 'Icon', 'Name', 'DBName', 'Widget'];

	// Dynamically grab the id, label, dbname, and widget for each object in the fields array
	// const headers = Object.keys(fields[0]);

	//console.log('headers:', headers.length);
	let gridClass = `grid grid-cols-${headers.length + 1}`;

	// svelte-dnd-action
	const flipDurationMs = 300;

	const handleDndConsider = (e: any) => {
		fields = e.detail.items;
		//console.log('handleDndConsider:', fields);
	};

	const handleDndFinalize = (e: any) => {
		fields = e.detail.items;
		//console.log('handleDndFinalize:', fields);
	};

	// Function to save data by sending a POST request
	function handleCollectionSave() {
		// Prepare form data
		let data =
			$mode == 'edit'
				? obj2formData({
						originalName: $collection.name,
						collectionName: name,
						icon: $collection.icon,
						status: $collection.status,
						slug: $collection.slug,
						description: $collection.description,
						permissions: $collection.permissions,
						fields: $collection.fields
					})
				: obj2formData({ fields, permissions, collectionName: name, icon, slug, description, status });

		console.log(data);

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

<div class="align-center mb-2 mt-2 flex justify-between dark:text-white">
	<PageTitle name={pageTitle} icon="ic:baseline-build" />
	{#if ($mode = 'edit')}
		<button type="button" on:click={handleCollectionSave} class="variant-filled-primary btn mt-2 justify-end dark:text-black">Save</button>
	{/if}
</div>

<div class="wrapper">
	<p class="mb-2 hidden text-center text-primary-500 sm:block">{m.collection_helptext()}</p>

	<TabGroup>
		<Tab bind:group={tabSet} name="tab1" value={0}>
			<div class="flex items-center gap-1">
				<iconify-icon icon="ic:baseline-edit" width="24" class="text-primary-500" />
				<span class:active={tabSet === 0} class:text-primary-500={tabSet === 0}>{m.collection_edit()}</span>
			</div>
		</Tab>
		<Tab bind:group={tabSet} name="tab2" value={1}>
			<div class="flex items-center gap-1">
				<iconify-icon icon="mdi:security-lock" width="24" class="text-primary-500" />
				<span class:active={tabSet === 1} class:text-primary-500={tabSet === 1}>{m.collection_permission()}</span>
			</div>
		</Tab>
		<Tab bind:group={tabSet} name="tab3" value={2}>
			<div class="flex items-center gap-1">
				<iconify-icon icon="mdi:widgets-outline" width="24" class="text-primary-500" />
				<span class:active={tabSet === 1} class:text-primary-500={tabSet === 2}>{m.collection_widgetfields()}</span>
			</div>
		</Tab>

		<!-- Tab Panels --->
		<svelte:fragment slot="panel">
			<!-- Edit -->
			{#if tabSet === 0}
				<div class="mb-2 text-center text-xs text-error-500">* {m.collection_required()}</div>

				<!-- Collection Name -->
				<div class="mb-2 flex flex-col items-start justify-center gap-2">
					<label for="name" class="flex-grow-1 relative mr-2 flex w-fit">
						{m.collection_name()} <span class="mx-1 text-error-500">*</span>
						<iconify-icon icon="material-symbols:info" use:popup={NameTooltip} width="18" class="ml-1 text-primary-500" /></label
					>

					<!-- tooltip -->
					<div class="card variant-filled-secondary z-50 max-w-sm p-4" data-popup="Name">
						<p>{m.collection_name_tooltip1()}</p>
						<p>{m.collection_name_tooltip2()}</p>
						<div class="variant-filled-secondary arrow" />
					</div>

					<input
						type="text"
						required
						id="name"
						bind:value={name}
						on:input={handleNameInput}
						placeholder={m.collection_name_placeholder()}
						class="input {name ? 'w-full md:w-1/2' : 'w-full'}"
					/>

					{#if name}
						<p class="mb-3 sm:mb-0">
							{m.collection_DBname()} <span class="font-bold text-primary-500">{DBName}</span>
						</p>
					{/if}
				</div>

				<div class="flex flex-col gap-2 rounded-md border p-2">
					<p class="mb-2 text-center font-bold text-primary-500">{m.collectionname_optional()}:</p>

					<!-- TODO: Pass icon icon selected values -->
					<!-- iconify icon chooser -->
					<div class="w-full items-center sm:flex">
						<label for="icon" class="flex-grow-1 relative mr-2 flex w-fit">
							{m.collectionname_labelicon()}
							<iconify-icon icon="material-symbols:info" use:popup={IconTooltip} width="18" class="ml-1 text-primary-500" />
						</label>

						<!-- tooltip -->
						<div class="card variant-filled-secondary z-50 max-w-sm p-4" data-popup="Icon">
							<p>{m.collection_icon_tooltip()}</p>
							<div class="variant-filled-secondary arrow" />
						</div>

						<IconifyPicker {searchQuery} {icon} {iconselected} />
					</div>

					<!-- Slug -->
					<div class="items-center sm:flex">
						<label for="slug" class="flex-grow-1 relative mr-2 flex w-fit">
							{m.collection_slug()}
							<iconify-icon icon="material-symbols:info" use:popup={SlugTooltip} width="18" class="ml-1 text-primary-500" />
						</label>

						<!-- tooltip -->
						<div class="card variant-filled-secondary z-50 max-w-sm p-4" data-popup="Slug">
							<p>{m.collection_slug_tooltip()}</p>
							<div class="variant-filled-secondary arrow" />
						</div>

						<input type="text" id="slug" bind:value={slug} placeholder={m.collection_slug_input()} class="input w-full" on:input={onSlugInput} />
					</div>

					<!-- Description -->
					<div class="items-center sm:flex">
						<label for="description" class="flex-grow-1 relative mr-2 flex w-fit">
							{m.collectionname_description()}
							<iconify-icon icon="material-symbols:info" use:popup={DescriptionTooltip} width="18" class="ml-1 text-primary-500" />
						</label>

						<!-- tooltip -->
						<div class="card variant-filled-secondary z-50 max-w-sm p-4" data-popup="Description">
							<p>{m.collection_description()}</p>
							<div class="variant-filled-secondary arrow" />
						</div>

						<textarea
							id="description"
							rows="2"
							cols="50"
							bind:value={description}
							placeholder={m.collection_description_placeholder()}
							class="input w-full"
						/>
					</div>

					<!-- Status -->
					<div class="items-center sm:flex">
						<label for="status" class="flex-grow-1 relative mr-2 flex w-fit">
							{m.collection_status()}
							<iconify-icon icon="material-symbols:info" use:popup={StatusTooltip} width="18" class="ml-1 text-primary-500" />
						</label>

						<!-- tooltip -->
						<div class="card variant-filled-secondary z-50 max-w-sm p-4" data-popup="Status">
							<p>{m.collection_status_tooltip()}</p>
							<div class="variant-filled-secondary arrow" />
						</div>

						<select id="status" bind:value={status} class="input w-full">
							{#each statuses as statusOption}
								<option value={statusOption} class="">{statusOption}</option>
							{/each}
						</select>
					</div>
				</div>

				<!-- Buttons -->
				<div class="flex justify-between">
					<a href="/collection" class="variant-filled-secondary btn mt-2">{m.collection_cancel()}</a>
					<button type="button" on:click={() => (tabSet = 1)} class="variant-filled-primary btn mt-2">{m.collection_next()}</button>
				</div>
			{:else if tabSet === 1}
				<!-- Permissions -->
				<Permissions />

				<!-- Buttons -->
				<div class="flex justify-between">
					<button type="button" on:click={() => (tabSet = 0)} class="variant-filled-secondary btn mt-2 justify-end">Previous</button>
					<button type="button" on:click={() => (tabSet = 2)} class="variant-filled-primary btn mt-2">Next</button>
				</div>

				<!-- Manage Fields -->
			{:else if tabSet === 2}
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
							<div class=" ">{field.widget.key}</div>

							<button type="button" class="variant-ghost-primary btn-icon ml-auto" on:click={() => modalWidgetForm(field.widget.key)}>
								<iconify-icon icon="ic:baseline-edit" width="24" class="dark:text-white" />
							</button>
						</div>
					{/each}
				</VerticalList>

				<div class="mt-2 flex items-center justify-center gap-3">
					<button on:click={modalSelectWidget} class="variant-filled-tertiary btn">{m.collection_widgetfield_addFields()} </button>
				</div>

				<div class=" flex items-center justify-between">
					<button type="button" on:click={() => (tabSet = 1)} class="variant-filled-secondary btn mt-2 justify-end"
						>{m.collection_widgetfield_previous()}</button
					>
					<button type="button" on:click={handleCollectionSave} class="variant-filled-primary btn mt-2 justify-end dark:text-black"
						>{m.collection_widgetfield_save()}</button
					>
				</div>
			{/if}
		</svelte:fragment>
	</TabGroup>
</div>

<style lang="postcss">
	label {
		min-width: 110px;
	}
</style>
