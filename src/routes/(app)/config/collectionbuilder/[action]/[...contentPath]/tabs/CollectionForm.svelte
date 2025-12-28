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
	import { untrack } from 'svelte';
	// Stores
	import { page } from '$app/state';
	import { app } from '@stores/store.svelte';
	import { collections } from '@src/stores/collectionStore.svelte';

	// Components
	import IconifyPicker from '@components/IconifyPicker.svelte';
	import { goto } from '$app/navigation';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { popup } from '@skeletonlabs/skeleton';
	import type { PopupSettings } from '@skeletonlabs/skeleton';
	// Collection Manager

	const props = $props();

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
	const action = page.params.action;

	// Form fields
	let searchQuery = $state('');
	let autoUpdateSlug = $state(true);
	let selectedIcon = $state(props.data?.icon || '');

	// Form field values
	let name = $state(props.data?.name ?? '');
	let slug = $state(props.data?.slug ?? '');
	let description = $state(props.data?.description ?? '');
	let status = $state(props.data?.status ?? 'unpublished');

	// Update form fields when props.data changes (for async loading)
	$effect(() => {
		if (props.data) {
			name = props.data.name ?? '';
			slug = props.data.slug ?? '';
			description = props.data.description ?? '';
			status = props.data.status ?? 'unpublished';
			selectedIcon = props.data.icon ?? '';
		}
	});

	// Derived values
	const DBName = $derived(name ? name.toLowerCase().replace(/ /g, '_') : '');

	// Update collection value when icon changes
	$effect(() => {
		// Only track the selectedIcon, not the collection
		const currentIcon = selectedIcon;

		untrack(() => {
			if (collections.active && currentIcon !== collections.active.icon) {
				collections.setCollection({
					...collections.active,
					icon: currentIcon
				});
			}
		});
	});

	// Update collection value when form fields change (only if editing an existing collection)
	$effect(() => {
		// Only track the form field changes, not the collection itself
		const currentName = name;
		const currentSlug = slug;
		const currentDescription = description;
		const currentStatus = status;
		const currentIcon = selectedIcon;

		// Use untrack to prevent reading collections.active from triggering this effect again
		untrack(() => {
			if (collections.active?._id) {
				// Check if values have actually changed to avoid unnecessary updates
				if (
					collections.active.name === currentName &&
					collections.active.slug === currentSlug &&
					collections.active.description === currentDescription &&
					collections.active.status === currentStatus &&
					collections.active.icon === currentIcon
				) {
					return;
				}

				collections.setCollection({
					...collections.active, // Spread existing values (including _id)
					name: currentName,
					slug: currentSlug,
					description: currentDescription,
					status: currentStatus,
					icon: currentIcon // Ensure icon is updated
				});
			}
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

	// Update slug and page title when name changes
	$effect(() => {
		// Only track the name and autoUpdateSlug, not the collection
		const currentName = name;
		const shouldAutoUpdate = autoUpdateSlug;

		// Automatically update slug when name changes
		if (shouldAutoUpdate && currentName) {
			slug = currentName.toLowerCase().replace(/ /g, '_');
		}

		// Update page title based on action and collection name
		if (action === 'edit') {
			props.handlePageTitleUpdate(currentName);
		} else if (currentName) {
			props.handlePageTitleUpdate(currentName);
		} else {
			props.handlePageTitleUpdate(`new`);
		}
	});

	// Import status types from the content types
	import { StatusTypes } from '@src/content/types';
	const statuses = Object.values(StatusTypes);

	function handleNextClick() {
		app.tabSetState = 1;
	}
</script>

<!-- Single Column Layout Container -->
<div class="flex w-full flex-col pb-10">
	<!-- Form Fields Grid -->
	<div class="grid grid-cols-1 gap-6 rounded border p-4 lg:grid-cols-2">
		<!-- Left Column: Text Fields -->
		<div class="flex flex-col gap-4">
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
					name="name"
					data-testid="collection-name-input"
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
				<input
					type="text"
					id="slug"
					bind:value={slug}
					placeholder={m.collection_slug_input()}
					class="input w-full text-black dark:text-primary-500"
				/>
				<!-- Slug Tooltip -->
				<div class="card variant-filled z-50 max-w-sm p-2" data-popup="Slug">
					<p>{m.collection_slug_tooltip()}</p>
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
					rows="4"
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
		</div>

		<!-- Right Column: Icon Picker & Optional -->
		<div class="flex flex-col gap-4 border-l pl-0 lg:pl-6 dark:border-surface-700">
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
				<div class="rounded-container-token border border-surface-200 bg-surface-50/50 p-4 dark:border-surface-700 dark:bg-surface-900/50">
					<IconifyPicker bind:iconselected={selectedIcon} bind:searchQuery />
				</div>
				<!-- Icon Tooltip -->
				<div class="card variant-filled z-50 max-w-sm p-2" data-popup="Icon">
					<p>{m.collection_icon_tooltip()}</p>
					<div class="variant-filled arrow"></div>
				</div>
			</div>
		</div>
	</div>

	<!-- Buttons Section -->
	<!-- Buttons Section -->
	<div class="mt-6 flex justify-between">
		<button type="button" onclick={() => goto('/config/collectionbuilder')} class="variant-ringed-error btn sm:w-auto font-bold">
			{m.button_cancel()}
		</button>

		<button type="button" onclick={handleNextClick} class="variant-filled-secondary btn sm:w-auto">
			{m.button_next()}
			<iconify-icon icon="mdi:arrow-right" class="ml-2"></iconify-icon>
		</button>
	</div>
</div>
