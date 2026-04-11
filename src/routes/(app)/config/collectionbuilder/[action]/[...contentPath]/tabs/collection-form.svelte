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
// Svelte
import { untrack } from "svelte";

// Paraglide
import {
	collection_description_placeholder,
	collection_name,
	collection_name_placeholder,
	collection_slug,
	collection_slug_input,
	collection_status,
	collectionname_description,
	collectionname_labelicon,
} from "@src/paraglide/messages";

// Stores
import { collection, setCollection } from "@src/stores/collection-store.svelte";

// Components
import IconifyIconsPicker from "@src/components/iconify-icons-picker.svelte";

// UI Components
import Input from "@src/components/ui/input.svelte";
import Button from "@src/components/ui/button.svelte";
import Card from "@src/components/ui/card.svelte";
import { StatusTypes } from "@src/content/types";

// Props from parent
let { data = $bindable(null), handlePageTitleUpdate } = $props();

//action

// Form fields
let searchQuery = $state("");
let autoUpdateSlug = $state(true);
let selectedIcon = $state(data?.icon || "");

// Form field values
let name = $state(data?.name ?? "");
let slug = $state(data?.slug ?? "");
let description = $state(data?.description ?? "");
let status = $state(data?.status ?? "unpublished");
// Only sync from server data when collection identity changes (navigation/load), not on every store update (so typing in Name works)
let lastSyncedId = $state<string | null>(null);

// Update form fields when we switch to a different collection (by _id/path) so load data applies; don't overwrite while user is typing.
// Only set selectedIcon when syncing a new collection to avoid effect loop with IconifyIconsPicker (effect_update_depth_exceeded).
$effect(() => {
	const fromData = data;
	const fromStore = collection.value;

	const id =
		fromData?._id ??
		fromData?.path ??
		fromStore?._id ??
		fromStore?.path ??
		null;
	const idStr = id != null ? String(id) : "";
	if (fromData && idStr !== lastSyncedId) {
		lastSyncedId = idStr;
		name = fromData.name ?? "";
		slug = fromData.slug ?? "";
		description = fromData.description ?? "";
		status = fromData.status ?? "unpublished";
		// Prefer load data over store so edit page always shows latest icon (no stale cache)
		const iconValue =
			(fromData?.icon != null && String(fromData.icon).trim()) ||
			(fromStore?.icon != null && String(fromStore.icon).trim()) ||
			"";
		selectedIcon = iconValue;
	}
});

// Derived values
const DB_NAME = $derived(name ? name.toLowerCase().replace(/ /g, "_") : "");

// Update collection value when icon changes
$effect(() => {
	// Only track the selectedIcon, not the collection
	const currentIcon = selectedIcon;

	untrack(() => {
		if (collection.value && currentIcon !== collection.value.icon) {
			setCollection({ ...collection.value, icon: currentIcon });
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
		)
			return;

		setCollection({
			...collection.value,
			name: currentName,
			slug: currentSlug,
			description: currentDescription,
			status: currentStatus,
			icon: currentIcon,
		});
	});
});

function handleNameInput() {
	if (typeof name === "string" && name) {
		handlePageTitleUpdate(name);
		if (autoUpdateSlug) {
			slug = name.toLowerCase().replace(/\s+/g, "_");
		}
	}
}

// Update slug and page title when name changes
$effect(() => {
	// Only track the name and autoUpdateSlug, not the collection
	const currentName = name;
	if (autoUpdateSlug && currentName) {
		slug = currentName.toLowerCase().replace(/ /g, "_");
	}
	handlePageTitleUpdate(currentName || "");
});

const statuses = Object.values(StatusTypes);
</script>

<div class="grid grid-cols-1 md:grid-cols-2 gap-8 h-full flex-col">
	<!-- Left Side: Basic Info -->
	 <Card class="wrapper">
			<h3 class="text-lg font-bold flex items-center gap-2 border-b border-surface-200 dark:border-surface-700 pb-2">
				<iconify-icon icon="mdi:information-outline" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
				Basic Information
			</h3>
			
			<Input
				bind:value={name}
				oninput={handleNameInput}
				label={collection_name()}
				placeholder={collection_name_placeholder()}
				required
			/>
			{#if name}
				<p class="text-[10px] uppercase tracking-wider text-surface-500 dark:text-surface-50 -mt-2">
					Database ID: <span class="font-bold text-primary-500">{DB_NAME}</span>
				</p>
			{/if}

			<div class="space-y-2">
				<label for="slug" class="text-sm font-medium leading-none text-surface-500 dark:text-surface-50">{collection_slug()}</label>
				<div class="flex gap-2">
					<div class="relative flex-1">
						<iconify-icon icon="mdi:link" class="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" width="18"></iconify-icon>
						<input 
							type="text" 
							id="slug" 
							bind:value={slug} 
							placeholder={collection_slug_input()} 
							class="flex h-10 w-full rounded-md border border-surface-300 dark:border-surface-600 bg-surface-50 dark:bg-surface-900 pl-10 pr-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
						/>
					</div>
					<Button 
						variant={autoUpdateSlug ? 'primary' : 'outline'} 
						size="sm" 
						onclick={() => (autoUpdateSlug = !autoUpdateSlug)}
						title="Toggle Auto-update"
					>
						<iconify-icon icon={autoUpdateSlug ? 'mdi:sync' : 'mdi:sync-off'} width="18"></iconify-icon>
					</Button>
				</div>
			</div>

			<div class="space-y-2">
				<label for="status" class="text-sm font-medium leading-none text-surface-500 dark:text-surface-50">{collection_status()}</label>
				<select 
					id="status" 
					bind:value={status} 
					class="flex h-10 w-full rounded-md border border-surface-300 dark:border-surface-600 bg-surface-50 dark:bg-surface-900 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 appearance-none cursor-pointer"
				>
					{#each statuses as statusOption}
						<option value={statusOption}>{statusOption}</option>
					{/each}
				</select>
			</div>
		</Card>
	
	<!-- Right Side: Style & Metadata -->
	 <Card class="wrapper">
			<h3 class="text-lg font-bold flex items-center gap-2 border-b border-surface-200 dark:border-surface-700 pb-2">
				<iconify-icon icon="mdi:palette-outline" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
				Visuals & Description
			</h3>

			<div class="space-y-2">
				<label for="icon" class="text-sm font-medium leading-none text-surface-500 dark:text-surface-50">{collectionname_labelicon()}</label>
				<IconifyIconsPicker bind:iconselected={selectedIcon} icon={selectedIcon} bind:searchQuery />
			</div>

			<div class="space-y-2 flex flex-col flex-1">
				<label for="description" class="text-sm font-medium leading-none text-surface-500 dark:text-surface-50">{collectionname_description()}</label>
				<textarea
					id="description"
					bind:value={description}
					placeholder={collection_description_placeholder()}
					class="flex-1 w-full rounded-md border border-surface-300 dark:border-surface-600 bg-surface-50 dark:bg-surface-900 p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 resize-none min-h-[120px]"
				></textarea>
			</div>
		</Card>
	
</div>
