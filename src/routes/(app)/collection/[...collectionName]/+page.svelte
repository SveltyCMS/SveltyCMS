<script lang="ts">
	import PageTitle from '@components/PageTitle.svelte';
	import Permissions from '@components/Permissions.svelte';
	import { page } from '$app/stores';

	// Log the entire $page object to the console
	// console.log($page);

	import VerticalList from '@components/VerticalList.svelte';
	import IconifyPicker from '@components/IconifyPicker.svelte';

	// skeleton
	import { getToastStore, TabGroup, Tab, getModalStore, popup } from '@skeletonlabs/skeleton';
	const toastStore = getToastStore();
	import type { ModalSettings, ModalComponent, PopupSettings } from '@skeletonlabs/skeleton';
	const modalStore = getModalStore();

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Access the data fetched from the server
	let { isEditMode, formCollectionName } = $page.data;
	let collectionName = formCollectionName || '';

	// $: fromCollectionName = formDataStore.collectionName;
	//let isEditMode = collectionName !== 'new';

	// Page Title
	$: pageTitle = isEditMode
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

	let DBName = '';
	let autoUpdateDBName = true;
	let description = '';
	let helper = '';
	let searchQuery = '';
	let icon: any = '';
	let iconselected: any = '';
	let status = 'unpublished';
	const statuses = ['published', 'unpublished', 'draft', 'schedule', 'cloned'];
	let slug = '';
	let autoUpdateSlug = true;

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

	//modal to display widget options
	import MyCustomComponent from './ModalWidgetForm.svelte';

	function modalComponentForm(): void {
		const c: ModalComponent = { ref: MyCustomComponent };
		const modal: ModalSettings = {
			type: 'component',
			component: c,
			title: 'Widget Creation',
			body: 'Complete the form below to create your widget and then press submit.',
			response: (r: any) => console.log('response:', r)
		};
		modalStore.trigger(modal);
	}

	//  Widget data
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
		const formData = new FormData();
		formData.append('collectionName', collectionName);
		// Append other form fields

		// Send data to the server
		// formDataStore.update((formData) => {
		// 	// return { ...formData, [e.target.name]: e.target.value };
		// 	console.log(formData);
		// });

		// Handle the server response as needed

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

<!-- {#await $page}
	<p>Loading...</p>
{:then}
	
	<div>
		<p>Edit Mode: {isEditMode ? 'Yes' : 'No'}</p>
		<p>Collection Name: {formCollectionName}</p>
		
{/await} -->

<div class="align-centre mb-2 mt-2 flex justify-between dark:text-white">
	<PageTitle name={pageTitle} icon="ic:baseline-build" />
	{#if isEditMode}
		<button type="button" on:click={handleCollectionSave} class="variant-filled-primary btn mt-2 justify-end dark:text-black">Save</button>
	{/if}
</div>

<div class="m-2">
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
				<div class="mb-2 flex flex-col items-start justify-center gap-2 sm:flex-row sm:items-center sm:justify-start">
					<label for="name" class="flex-grow-1 relative mr-2 flex w-fit">
						{m.collection_name()} <span class="mx-1 text-error-500">*</span>
						<iconify-icon icon="material-symbols:info" use:popup={NameTooltip} width="18" class="ml-1 text-primary-500" /></label
					>

					<!-- tooltip -->
					<div class="card variant-filled-secondary p-4" data-popup="Name">
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
					<p class="mb-2 text-center font-bold text-primary-500">{m.collectionname_optional()}</p>

					<!-- TODO: Pass icon icon selected values -->
					<!-- iconify icon chooser -->
					<div class="w-full items-center sm:flex">
						<label for="icon" class="flex-grow-1 relative mr-2 flex w-fit">
							{m.collectionname_labelicon()}
							<iconify-icon icon="material-symbols:info" use:popup={IconTooltip} width="18" class="ml-1 text-primary-500" />
						</label>

						<!-- tooltip -->
						<div class="card variant-filled-secondary p-4" data-popup="Icon">
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
						<div class="card variant-filled-secondary p-4" data-popup="Slug">
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
						<div class="card variant-filled-secondary p-4" data-popup="Description">
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
						<div class="card variant-filled-secondary p-4" data-popup="Status">
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
						<div class="border-blue variant-ghost-secondary my-2 flex w-full items-center gap-6 rounded-md border p-1 text-center text-primary-500">
							<div class="flex-grow-1 variant-outline-primary badge rounded-full text-white">
								{id}
							</div>
							<iconify-icon {icon} width="24" class="flex-grow-1 text-primary-500" />
							<div class="flex-grow-3 text-white">{collectionName}</div>
							<div class="flex-grow-2 text-white">{DBName}</div>
							<div class="flex-grow-2 text-white">{widget}</div>
							<button type="button" class="btn-icon ml-auto hover:variant-ghost-primary"
								><iconify-icon icon="bi:trash-fill" width="18" class="text-error-500" /></button
							>
						</div>
					{/each}
				</VerticalList>

				<div class="mt-2 flex items-center justify-center gap-3">
					<button class="variant-filled-tertiary btn" on:click={modalComponentForm}>{m.collection_widgetfield_addFields()}</button>
					<button class="variant-filled-secondary btn" on:click={modalComponentForm}>Add more Fields overlay</button>
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
