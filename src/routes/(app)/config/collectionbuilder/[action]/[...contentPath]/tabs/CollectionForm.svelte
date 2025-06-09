<!-- 
@files src/routes/(app)/config/collectionbuilder/[...contentTypes]/tabs/CollectionForm.svelte
@component
**This component displays the collection form**

### Props:
- `collection` {object} - Collection object
- `handlePageTitleUpdate` {function} - Function to update the page title

### Features:
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

	let props = $props<{ data: any; handlePageTitleUpdate: (title: string) => void }>();

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

	// Update collection value when form fields change (only if editing an existing collection)
	$effect(() => {
		if (collection.value?._id) {
			// Check if values have actually changed to avoid unnecessary updates
			if (
				collection.value.name === name &&
				collection.value.slug === slug &&
				collection.value.description === description &&
				collection.value.status === status &&
				collection.value.icon === selectedIcon
			) {
				return;
			}

			collection.set({
				...collection.value, // Spread existing values (including _id)
				name,
				slug,
				description,
				status,
				icon: selectedIcon // Ensure icon is updated
			});
		}
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

<!-- Single Column Layout Container -->
<div class="flex w-full flex-col">
	<!-- Form Fields Section -->
	<div class="flex flex-col gap-2 rounded border p-4">
		<!-- Collection Name -->
		<div class="flex flex-col">
			<label for="name" class="mb-1 flex items-center font-medium">
				{m.collection_name()} <span class="mx-1 text-error-500">*</span>
				<iconify-icon
					icon="material-symbols:info"
					use:popup={NameTooltip}
					width="18"
					class="ml-1 cursor-pointer text-tertiary-500 dark:text-primary-500"
				></iconify-icon>
			</label>
			<input
				type="text"
				required
				id="name"
				bind:value={name}
				oninput={handleNameInput}
				placeholder={m.collection_name_placeholder()}
				aria-label={m.collection_name()}
				class="input w-full text-black dark:text-primary-500"
			/>
			{#if name}
				<!-- Show DBName if name is entered -->
				<p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
					{m.collection_DBname()}
					<span class="font-bold text-tertiary-500 dark:text-primary-500">{DBName}</span>
				</p>
			{/if}
			<!-- Name Tooltip -->
			<div class="card variant-filled z-50 max-w-sm p-2" data-popup="Name">
				<p>{m.collection_name_tooltip1()}</p>
				<p>{m.collection_name_tooltip2()}</p>
				<div class="variant-filled arrow"></div>
			</div>
		</div>

		<!-- Separator (Optional) -->
		<hr class="my-2 border-gray-300 dark:border-gray-600" />

		<p class="text-token mb-0 text-center font-bold">{m.collectionname_optional()}:</p>

		<!-- Icon -->
		<div class="flex flex-col">
			<label for="icon" class="mb-1 flex items-center font-medium">
				{m.collectionname_labelicon()}
				<iconify-icon
					icon="material-symbols:info"
					use:popup={IconTooltip}
					width="18"
					class="ml-1 cursor-pointer text-tertiary-500 dark:text-primary-500"
				></iconify-icon>
			</label>
			<IconifyPicker bind:iconselected={selectedIcon} bind:searchQuery />
			<!-- Icon Tooltip -->
			<div class="card variant-filled z-50 max-w-sm p-2" data-popup="Icon">
				<p>{m.collection_icon_tooltip()}</p>
				<div class="variant-filled arrow"></div>
			</div>
		</div>

		<!-- Slug -->
		<div class="flex flex-col">
			<label for="slug" class="mb-1 flex items-center font-medium">
				{m.collection_slug()}
				<iconify-icon
					icon="material-symbols:info"
					use:popup={SlugTooltip}
					width="18"
					class="ml-1 cursor-pointer text-tertiary-500 dark:text-primary-500"
				></iconify-icon>
			</label>
			<input type="text" id="slug" bind:value={slug} placeholder={m.collection_slug_input()} class="input w-full text-black dark:text-primary-500" />
			<!-- Slug Tooltip -->
			<div class="card variant-filled z-50 max-w-sm p-2" data-popup="Slug">
				<p>{m.collection_slug_tooltip()}</p>
				<div class="variant-filled arrow"></div>
			</div>
		</div>

		<!-- Description -->
		<div class="flex flex-col">
			<label for="description" class="mb-1 flex items-center font-medium">
				{m.collectionname_description()}
				<iconify-icon
					icon="material-symbols:info"
					use:popup={DescriptionTooltip}
					width="18"
					class="ml-1 cursor-pointer text-tertiary-500 dark:text-primary-500"
				></iconify-icon>
			</label>
			<textarea
				id="description"
				rows="2"
				bind:value={description}
				placeholder={m.collection_description_placeholder()}
				class="input w-full text-black dark:text-primary-500"
			></textarea>
			<!-- Description Tooltip -->
			<div class="card variant-filled z-50 max-w-sm p-2" data-popup="Description">
				<p>{m.collection_description()}</p>
				<div class="variant-filled arrow"></div>
			</div>
		</div>

		<!-- Status -->
		<div class="flex flex-col">
			<label for="status" class="mb-1 flex items-center font-medium">
				{m.collection_status()}
				<iconify-icon
					icon="material-symbols:info"
					use:popup={StatusTooltip}
					width="18"
					class="ml-1 cursor-pointer text-tertiary-500 dark:text-primary-500"
				></iconify-icon>
			</label>
			<select id="status" bind:value={status} class="select w-full text-black dark:text-primary-500">
				{#each statuses as statusOption}
					<option value={statusOption}>{statusOption}</option>
				{/each}
			</select>
			<!-- Status Tooltip -->
			<div class="card variant-filled z-50 max-w-sm p-2" data-popup="Status">
				<p>{m.collection_status_tooltip()}</p>
				<div class="variant-filled arrow"></div>
			</div>
		</div>
	</div>

	<!-- Buttons Section -->
	<div class="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-between">
		<a href="/config/collectionbuilder" class="variant-outline-secondary btn sm:w-auto">{m.button_cancel()}</a>
		<button type="button" onclick={handleNextClick} class="variant-filled-tertiary btn dark:variant-filled-primary sm:w-auto"
			>{m.button_next()}</button
		>
	</div>
</div>
