<script lang="ts">
	import PageTitle from '@components/PageTitle.svelte';
	import Permissions from '@components/Permissions.svelte';
	import { page } from '$app/stores';
	import { mode, collection } from '@stores/store';
	import VerticalList from '@components/VerticalList.svelte';
	import IconifyPicker from '@components/IconifyPicker.svelte';
	import widgets from '@components/widgets';
	import { obj2formData } from '@utils/utils';
	import axios from 'axios';

	console.log('mode:', $mode);
	mode.set('edit');
	console.log('mode:', $mode);

	// Access the data fetched from the server
	let { formCollectionName, collectionData } = $page.data;
	let collectionName = formCollectionName || '';

	console.log('collection:', $collection);
	console.log('collectionData:', $page.data.collectionData);
	

	// Required default widget fields
	let name = $mode == 'edit' ? $page.data.collectionData.name : '';
	let icon = $mode == 'edit' ? $page.data.collectionData.icon : '';
	let description = $mode == 'edit' ? $page.data.collectionData.description : '';
	let status = $mode == 'edit' ? $page.data.collectionData.status : 'unpublish';
	let slug = $mode == 'edit' ? $page.data.collectionData.slug : name;

	let selected_widget: keyof typeof widgets | null = null;

	console.log('collectionName:', name);
	console.log('collectionIcon:', icon);
	console.log('collectionStatus:', status);
	console.log('collectionSlug:', slug);

	let DBName = '';
	let searchQuery = '';
	let iconselected: any = '';
	const statuses = ['published', 'unpublished', 'draft', 'schedule', 'cloned'];
	let autoUpdateSlug = true;
	let expanded = false;

	// skeleton
	import { getToastStore, TabGroup, Tab, getModalStore, popup } from '@skeletonlabs/skeleton';
	const toastStore = getToastStore();
	import type { ModalSettings, ModalComponent, PopupSettings } from '@skeletonlabs/skeleton';
	const modalStore = getModalStore();

	//modal to display widget options
	import ModalSelectWidget from './ModalSelectWidget.svelte';
	import ModalWidgetForm from './ModalWidgetForm.svelte';

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
				const { selected_widget } = r; // Extract the selected widget from the response object
				modalWidgetForm(selected_widget); // Call the `modalWidgetForm` function with the selected widget as the argument
			}
		};
		modalStore.trigger(modal);
	}

	console.log('check selected_widget:', selected_widget);

	function modalWidgetForm(selected_widget: any): void {
		const c: ModalComponent = { ref: ModalWidgetForm };
		console.log('selected_widget:', selected_widget);
		const modal: ModalSettings = {
			type: 'component',
			component: c,
			title: 'Define your Widget: ' + selected_widget.selectedWidget, // Access the selectedWidget property of the object
			body: 'Setup your widget and then press submit.',
			value: selected_widget, // Pass the selected widget as the initial value
			response: (r: any) => console.log('response modalWidgetForm:', r)
		};
		modalStore.trigger(modal);
	}
	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	

	// Page Title
	$: pageTitle =
		$mode == 'edit'
			? `Edit <span class="text-primary-500">${collectionName} </span> Collection`
			: collectionName
				? `Create <span class="text-primary-500"> ${collectionName} </span> Collection`
				: `Create <span class="text-primary-500"> new </span> Collection`;

	let lockedName: boolean = true;

	function checkInputName() {
		if (collectionName) {
			lockedName = false;
		} else {
			lockedName = true;
		}
	}

	let tabSet: number = 0;

	$: {
		// Update DBName  lowercase and replace Spaces
		DBName = collectionName.toLowerCase().replace(/ /g, '_');

		// Automatically update slug when name changes
		if (autoUpdateSlug) {
			slug = collectionName.toLowerCase().replace(/\s+/g, '_');
		}
	}

	// Stop automatically updating slug when user manually edits it
	function onSlugInput() {
		autoUpdateSlug = false;
	}

	//  Widget data

	// let collectionObject = JSON.parse(collectionData);
	// let name = collectionObject.name;
	// let icon = collectionObject.icon;
	// let description = collectionObject.description;
	// let status = collectionObject.status;
	// let slug = collectionObject.slug;
	// let fields = collectionObject.fields;
	// let permission = collectionObject.permissions;
	// if (fields) {
	// 	fields = fields.map((item, index) => ({ ...item, id: index + 1 }));
	// }
	// export let items: any;
	// console.log('dataItem', items);
	let items = [
		{ id: 1, collectionName: 'First', DBName: 'first', widget: 'Text', icon: 'ic:baseline-text-fields' },
		{ id: 2, collectionName: 'Last', DBName: 'last', widget: 'Text', icon: 'ic:baseline-text-fields' },
		{ id: 3, collectionName: 'Email', DBName: 'email', widget: 'Email', icon: 'ic:baseline-email' },
		{ id: 4, collectionName: 'Image', DBName: 'image', widget: 'ImageUpload', icon: 'ic:baseline-image' }
	];

	const headers = ['ID', 'Icon', 'Name', 'DBName', 'Widget'];

	const flipDurationMs = 300;

	const handleDndConsider = (e) => {
		items = e.detail.items;
	};

	const handleDndFinalize = (e) => {
		items = e.detail.items;
	};

	async function handleCollectionSave() {
		// Prepare form data
		let data =
			// $mode == 'edit'
			obj2formData({
				originalName: $collection.name,
				collectionName: name,
				icon: $collection.icon,
				status: $collection.status,
				slug: $collection.slug,
				fields: $collection.fields,
				permission: $collection.permissions
			});
		// : obj2formData({ fields, collectionName: name, icon, status, slug, permission });
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
					<div class="card variant-filled-secondary z-50 p-4" data-popup="Name">
						<p>{m.collection_name_tooltip1()}</p>
						<p>{m.collection_name_tooltip2()}</p>
						<div class="variant-filled-secondary arrow" />
					</div>

					<input
						type="text"
						required
						id="name"
						bind:value={collectionName}
						on:input={checkInputName}
						placeholder={m.collection_name_placeholder()}
						class="input {collectionName ? 'w-full md:w-1/2' : 'w-full'}"
					/>

					{#if collectionName}
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
						<div class="card variant-filled-secondary z-50 p-4" data-popup="Icon">
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
						<div class="card variant-filled-secondary z-50 p-4" data-popup="Slug">
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
						<div class="card variant-filled-secondary z-50 p-4" data-popup="Description">
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
						<div class="card variant-filled-secondary z-50 p-4" data-popup="Status">
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
				<VerticalList {items} {headers} {flipDurationMs} {handleDndConsider} {handleDndFinalize}>
					{#each items as { id, icon, collectionName, DBName, widget } (id)}
						<div
							class="border-blue variant-outline-surface my-2 flex w-full items-center gap-6 rounded-md border p-1 text-center text-black hover:variant-filled-surface dark:text-white"
						>
							<div class="flex-grow-1 variant-ghost-primary badge rounded-full">
								{id}
							</div>
							<iconify-icon {icon} width="24" class="flex-grow-1 text-primary-500" />
							<div class="flex-grow-3">{collectionName}</div>
							<div class="flex-grow-2">{DBName}</div>
							<div class="flex-grow-2">{widget}</div>
							<button type="button" class="btn-icon ml-auto hover:variant-ghost-primary"
								><iconify-icon icon="bi:trash-fill" width="18" class="text-error-500" /></button
							>
						</div>
					{/each}
				</VerticalList>

				<div class="mt-2 flex items-center justify-center gap-3">
					<!-- <button class="variant-filled-tertiary btn" on:click={modalComponentForm}>{m.collection_widgetfield_addFields()}</button> -->
					<button on:click={modalSelectWidget} class="variant-filled-tertiary btn" class:selected={expanded}
						>{m.collection_widgetfield_addFields()}
					</button>
				</div>

				<!-- {#if expanded}
					<div class="mb-3 border-b text-center text-primary-500">Choose your Widget</div>
					<div class="flex flex-wrap items-center justify-center gap-2">
						{#each widget_keys as item}
							<button
								class=" variant-outline-warning btn relative hover:variant-filled-secondary"
								on:click={() => {
									selected = item;
									expanded = false;
									modalComponentForm(selected);
								}}
							>
								<span class="text-surface-700 dark:text-white">{item}</span>
							</button>
						{/each}
					</div>
				{/if} -->

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
