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
	// Paraglide Messages
	import {
		collection_name,
		collection_name_placeholder,
		collection_slug,
		collection_slug_input,
		collection_status,
		collectionname_labelicon,
		collectionname_description,
		collection_description_placeholder
	} from '@src/paraglide/messages';

	// Components
	import IconifyIconsPicker from '@src/components/iconify-icons-picker.svelte';

	import { collection, setCollection } from '@src/stores/collection-store.svelte';
	import { untrack } from 'svelte';
	// Stores
	import { page } from '$app/state';

	// Skeleton
	// Collection Manager

	// Props from parent
	let { data = $bindable(null), handlePageTitleUpdate } = $props();

	//action
	const action = page.params.action;

	// Form fields
	let searchQuery = $state('');
	let autoUpdateSlug = $state(true);
	let selectedIcon = $state(data?.icon || '');

	// Form field values
	let name = $state(data?.name ?? '');
	let slug = $state(data?.slug ?? '');
	let description = $state(data?.description ?? '');
	let status = $state(data?.status ?? 'unpublished');
	// Only sync from server data when collection identity changes (navigation/load), not on every store update (so typing in Name works)
	let lastSyncedId = $state<string | null>(null);

	// Update form fields when we switch to a different collection (by _id/path) so load data applies; don't overwrite while user is typing.
	// Only set selectedIcon when syncing a new collection to avoid effect loop with IconifyIconsPicker (effect_update_depth_exceeded).
	$effect(() => {
		const fromData = data;
		const fromStore = collection.value;
		const id = fromData?._id ?? fromData?.path ?? fromStore?._id ?? fromStore?.path ?? null;
		const idStr = id != null ? String(id) : '';
		if (fromData && idStr !== lastSyncedId) {
			lastSyncedId = idStr;
			name = fromData.name ?? '';
			slug = fromData.slug ?? '';
			description = fromData.description ?? '';
			status = fromData.status ?? 'unpublished';
			const iconValue =
				(fromStore?.icon != null && String(fromStore.icon).trim()) ||
				(fromData?.icon != null && String(fromData.icon).trim()) ||
				'';
			selectedIcon = iconValue;
		}
	});

	// Derived values
	const DBName = $derived(name ? name.toLowerCase().replace(/ /g, '_') : '');

	// Update collection value when icon changes
	$effect(() => {
		// Only track the selectedIcon, not the collection
		const currentIcon = selectedIcon;

		untrack(() => {
			if (collection.value && currentIcon !== collection.value.icon) {
				setCollection({
					...collection.value,
					icon: currentIcon
				});
			}
		});
	});

	// Sync form fields (name, slug, description, status, icon) into the collection store for both create and edit.
	// Without this, Status/Icon/Description are never written to the store for new collections (no _id yet),
	// so Save sends stale/empty values and they are not persisted.
	$effect(() => {
		const currentName = name;
		const currentSlug = slug;
		const currentDescription = description;
		const currentStatus = status;
		const currentIcon = selectedIcon;

		untrack(() => {
			if (!collection.value) return;
			if (
				collection.value.name === currentName &&
				collection.value.slug === currentSlug &&
				collection.value.description === currentDescription &&
				collection.value.status === currentStatus &&
				collection.value.icon === currentIcon
			) {
				return;
			}

			setCollection({
				...collection.value,
				name: currentName,
				slug: currentSlug,
				description: currentDescription,
				status: currentStatus,
				icon: currentIcon
			});
		});
	});

	function handleNameInput() {
		if (typeof name === 'string' && name) {
			// Update the URL
			window.history.replaceState({}, '', `/config/collectionbuilder/${action}/${slug}`);

			// Update the page title
			handlePageTitleUpdate(name);

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
			handlePageTitleUpdate(currentName);
		} else if (currentName) {
			handlePageTitleUpdate(currentName);
		} else {
			handlePageTitleUpdate('new');
		}
	});

	// Import status types from the content types
	import { StatusTypes } from '@src/content/types';

	const statuses = Object.values(StatusTypes);
</script>

<!-- Single Column Layout Container -->
<div class="flex w-full flex-col space-y-6">
	<!-- Form Fields Section -->
	<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
		<!-- Left Side: Basic Info -->
		<div class="space-y-4">
			<!-- Collection Name -->
			<div class="flex flex-col">
				<label for="name" class="mb-1 flex items-center font-bold text-sm">
					{collection_name()} <span class="mx-1 text-error-500">*</span>
					<iconify-icon icon="material-symbols:info-outline" width="16" class="ml-auto opacity-50"></iconify-icon>
				</label>
				<input
					type="text"
					required
					id="name"
					name="name"
					bind:value={name}
					oninput={handleNameInput}
					placeholder={collection_name_placeholder()}
					class="input w-full"
				/>
				{#if name}
					<p class="mt-1 text-[10px] uppercase tracking-wider text-surface-500">
						Database ID: <span class="font-bold text-primary-500">{DBName}</span>
					</p>
				{/if}
			</div>

			<!-- Slug -->
			<div class="flex flex-col">
				<label for="slug" class="mb-1 flex items-center font-bold text-sm">
					{collection_slug()}
					<iconify-icon icon="material-symbols:link" width="16" class="ml-auto opacity-50"></iconify-icon>
				</label>
				<div class="input-group grid-cols-[1fr_auto] overflow-hidden">
					<input type="text" id="slug" bind:value={slug} placeholder={collection_slug_input()} />
					<button class="bg-surface-200-800 px-2" onclick={() => (autoUpdateSlug = !autoUpdateSlug)} title="Toggle Auto-update">
						<iconify-icon icon={autoUpdateSlug ? 'mdi:sync' : 'mdi:sync-off'} width="18"></iconify-icon>
					</button>
				</div>
			</div>

			<!-- Status -->
			<div class="flex flex-col">
				<label for="status" class="mb-1 flex items-center font-bold text-sm"> {collection_status()} </label>
				<select id="status" bind:value={status} class="select w-full">
					{#each statuses as statusOption (statusOption)}
						<option value={statusOption}>{statusOption}</option>
					{/each}
				</select>
			</div>
		</div>

		<!-- Right Side: Visuals & Desc -->
		<div class="space-y-4">
			<!-- Icon -->
			<div class="flex flex-col">
				<label for="icon" class="mb-1 flex items-center font-bold text-sm"> {collectionname_labelicon()} </label>
				<IconifyIconsPicker bind:iconselected={selectedIcon} icon={selectedIcon} bind:searchQuery />
			</div>

			<!-- Description -->
			<div class="flex flex-col flex-1">
				<label for="description" class="mb-1 flex items-center font-bold text-sm"> {collectionname_description()} </label>
				<textarea
					id="description"
					rows="4"
					bind:value={description}
					placeholder={collection_description_placeholder()}
					class="input w-full flex-1 resize-none"
				></textarea>
			</div>
		</div>
	</div>
</div>
