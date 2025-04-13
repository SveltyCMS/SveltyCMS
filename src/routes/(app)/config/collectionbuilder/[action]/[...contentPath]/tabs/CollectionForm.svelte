<!-- 
@files src/routes/(app)/config/collectionbuilder/[...contentTypes]/tabs/CollectionForm.svelte
@component
**This component displays the collection form**

Features:
- Collection Name
- Collection Icon
- Collection Description
-->

<script lang="ts">
	// Stores
	import { page } from '$app/state';
	import { tabSet } from '@stores/store.svelte';
	import { mode, collection } from '@root/src/stores/collectionStore.svelte';

	// Components
	import IconifyPicker from '@components/IconifyPicker.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { popup } from '@skeletonlabs/skeleton';
	import type { PopupSettings } from '@skeletonlabs/skeleton';
	// Collection Manager

	interface CollectionData {
		name: string;
		icon: string;
		description: string;
		status: string;
		slug: string;
		fields: any[];
		[key: string]: unknown;
	}

	let props = $props<{ data: any; handlePageTitleUpdate: (title: string) => void }>();

	// Define the base collection structure
	const baseCollection: CollectionData = {
		name: '',
		icon: '',
		description: '',
		status: 'unpublished',
		slug: '',
		fields: []
	};

	// Popup Tooltips
	const NameTooltip: PopupSettings = {
		event: 'hover',
		target: 'Name',
		placement: 'right'
	};
	const IconTooltip: PopupSettings = {
		event: 'hover',
		target: 'Icon',
		placement: 'right'
	};
	const SlugTooltip: PopupSettings = {
		event: 'hover',
		target: 'Slug',
		placement: 'right'
	};
	const DescriptionTooltip: PopupSettings = {
		event: 'hover',
		target: 'Description',
		placement: 'right'
	};
	const StatusTooltip: PopupSettings = {
		event: 'hover',
		target: 'Status',
		placement: 'right'
	};

	//action
	let action = page.params.action;

	// Form fields
	let searchQuery = $state('');
	let autoUpdateSlug = $state(true);
	let selectedIcon = $state(props.data?.icon || '');

	// Form field values
	let name = $state(props.data?.name ?? '');
	let slug = $state(props.data?.slug ?? '');
	let description = $state(props.data?.description ?? '');
	let status = $state(props.data?.status ?? 'unpublished');

	// Derived values
	let DBName = $derived(name ? name.toLowerCase().replace(/ /g, '_') : '');

	// Update collection value when icon changes
	$effect(() => {
		if (!collection.value) return;
		if (selectedIcon !== collection.value?.icon) {
			collection.set({
				...collection.value,
				icon: selectedIcon
			});
		}
	});

	// Update collection value when form fields change
	$effect(() => {
		if (
			collection.value &&
			collection.value.name === name &&
			collection.value.slug === slug &&
			collection.value.description === description &&
			collection.value.status === status
		)
			return;

		collection.set({
			...collection.value,
			name,
			slug,
			description,
			status
		});
	});

	function handleNameInput() {
		if (typeof name === 'string' && name) {
			// Update the URL
			window.history.replaceState({}, '', `/config/collectionbuilder/${action}/${slug}`);

			// Update the page title
			props.handlePageTitleUpdate(name);

			// Update the linked slug input
			slug = name.toLowerCase().replace(/\s+/g, '_');

			// Call the `onSlugInput` function to update the slug variable
			onSlugInput();
		}
	}

	function onSlugInput() {
		// Update the slug field whenever the name field is changed
		if (name) {
			slug = name.toLowerCase().replace(/\s+/g, '_');
			return slug;
		}
		// Disable automatic slug updates
		autoUpdateSlug = false;
	}

	// Update slug and page title when collection value changes
	$effect(() => {
		if (collection.value) {
			// Automatically update slug when name changes
			if (autoUpdateSlug) {
				slug = name ? name.toLowerCase().replace(/ /g, '_') : '';
			}

			// Update page title based on mode and collection name
			if (mode.value === 'edit') {
				props.handlePageTitleUpdate(name);
			} else if (name) {
				props.handlePageTitleUpdate(name);
			} else {
				props.handlePageTitleUpdate(`new`);
			}
		}
	});

	const statuses = ['published', 'unpublished', 'draft', 'schedule', 'cloned'];

	function handleNextClick() {
		tabSet.set(1);
	}
</script>

<!-- Required -->
<div class="mb-2 text-center text-xs text-error-500">* {m.collection_required()}</div>

<!-- Collection Name -->
<div class="flex flex-col gap-3 rounded p-2">
	<div class="w-full items-center sm:flex">
		<label for="name" class="flex-grow-1 relative mr-2 flex w-36">
			{m.collection_name()} <span class="mx-1 text-error-500">*</span>
			<iconify-icon icon="material-symbols:info" use:popup={NameTooltip} width="18" class="ml-1 text-tertiary-500 dark:text-primary-500"
			></iconify-icon></label
		>

		<div class="w-full">
			<input
				type="text"
				required
				id="name"
				bind:value={name}
				oninput={handleNameInput}
				placeholder={m.collection_name_placeholder()}
				aria-label={m.collection_name()}
				class="input text-black dark:text-primary-500"
			/>

			{#if collection.value && collection.value.name}
				<p class="mb-3 sm:mb-0">
					{m.collection_DBname()} <span class="font-bold text-tertiary-500 dark:text-primary-500">{DBName}</span>
				</p>
			{/if}
		</div>

		<!-- Tooltip -->
		<div class="card variant-filled z-50 max-w-sm" data-popup="Name">
			<!-- Popup Tooltip with the arrow element -->
			<div class="card variant-filled z-50 max-w-sm p-2" data-popup="Name">
				<p>{m.collection_name_tooltip1()}</p>
				<p>{m.collection_name_tooltip2()}</p>
				<div class="variant-filled arrow"></div>
			</div>
		</div>
	</div>
</div>

<div class="flex flex-col gap-3 rounded-md border p-2">
	<p class="text-token mb-2 text-center font-bold">{m.collectionname_optional()}:</p>

	<!-- Iconify icon chooser -->
	<div class="w-full items-center sm:flex">
		<label for="icon" class="flex-grow-1 relative mr-2 flex w-36">
			{m.collectionname_labelicon()}
			<iconify-icon icon="material-symbols:info" use:popup={IconTooltip} width="18" class="ml-1 text-tertiary-500 dark:text-primary-500"
			></iconify-icon>
		</label>

		<!-- Popup Tooltip with the arrow element -->
		<div class="card variant-filled z-50 max-w-sm p-2" data-popup="Icon">
			<p>{m.collection_icon_tooltip()}</p>
			<div class="variant-filled arrow"></div>
		</div>

		<IconifyPicker bind:iconselected={selectedIcon} bind:searchQuery />
	</div>

	<!-- Slug -->
	<div class="items-center sm:flex">
		<label for="slug" class="flex-grow-1 relative mr-2 flex w-36">
			{m.collection_slug()}
			<iconify-icon icon="material-symbols:info" use:popup={SlugTooltip} width="18" class="ml-1 text-tertiary-500 dark:text-primary-500"
			></iconify-icon>
		</label>

		<!-- Popup Tooltip with the arrow element -->
		<div class="card variant-filled z-50 max-w-sm p-2" data-popup="Slug">
			<p>{m.collection_slug_tooltip()}</p>
			<div class="variant-filled arrow"></div>
		</div>

		<input type="text" id="slug" bind:value={slug} placeholder={m.collection_slug_input()} class="input text-black dark:text-primary-500" />
	</div>

	<!-- Description -->
	<div class="items-center sm:flex">
		<label for="description" class="flex-grow-1 relative mr-2 flex w-36">
			{m.collectionname_description()}
			<iconify-icon icon="material-symbols:info" use:popup={DescriptionTooltip} width="18" class="ml-1 text-tertiary-500 dark:text-primary-500"
			></iconify-icon>
		</label>

		<!-- Popup Tooltip with the arrow element -->
		<div class="card variant-filled z-50 max-w-sm p-2" data-popup="Description">
			<p>{m.collection_description()}</p>
			<div class="variant-filled arrow"></div>
		</div>

		<textarea
			id="description"
			rows="2"
			cols="50"
			bind:value={description}
			placeholder={m.collection_description_placeholder()}
			class="input text-black dark:text-primary-500"
		></textarea>
	</div>

	<!-- Status -->
	<div class="items-center sm:flex">
		<label for="status" class="flex-grow-1 relative mr-2 flex w-36">
			{m.collection_status()}
			<iconify-icon icon="material-symbols:info" use:popup={StatusTooltip} width="18" class="ml-1 text-tertiary-500 dark:text-primary-500"
			></iconify-icon>
		</label>

		<!-- Popup Tooltip with the arrow element -->
		<div class="card variant-filled z-50 max-w-sm p-2" data-popup="Status">
			<p>{m.collection_status_tooltip()}</p>
			<div class="variant-filled arrow"></div>
		</div>

		<select id="status" bind:value={status} class="input text-black dark:text-primary-500">
			{#each statuses as statusOption}
				<option value={statusOption} class="">{statusOption}</option>
			{/each}
		</select>
	</div>
</div>

<!-- Buttons Cancel & Next-->
<div class="mt-2 flex justify-between">
	<a href="/config/collectionbuilder" class="variant-filled-secondary btn mt-2">{m.button_cancel()}</a>
	<button type="button" onclick={handleNextClick} class="variant-filled-tertiary btn mt-2 dark:variant-filled-primary">{m.button_next()}</button>
</div>
