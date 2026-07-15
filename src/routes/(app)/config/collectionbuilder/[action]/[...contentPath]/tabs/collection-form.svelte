<!--
@file src/routes/(app)/config/collectionbuilder/[action]/[...contentPath]/tabs/collection-form.svelte
@component Collection Definition — Tab 1: name, db_name, description, icon
 -->
<script lang="ts">
import { untrack } from "svelte";
import {
	collection_description_placeholder,
	collection_name,
	collection_name_placeholder,
	collectionname_description,
	collectionname_labelicon,
} from "@src/paraglide/messages";

import { collection, setCollection } from "@src/stores/collection-store.svelte";
import IconifyIconsPicker from "@src/components/iconify-icons-picker.svelte";
import Input from "@src/components/ui/input.svelte";
import Card from "@src/components/ui/card.svelte";

let { data = $bindable(null), syncKey = "" } = $props();

let searchQuery = $state("");
let selectedIcon = $state(data?.icon || "");

let name = $state(data?.name ?? "");
let description = $state(data?.description ?? "");
let lastSyncedKey = $state<string | null>(null);

// Sync from route-loaded data when target changes
$effect(() => {
	const fromData = data;
	const fromStore = collection.value;
	const currentSyncKey = syncKey;

	if (fromData && currentSyncKey && currentSyncKey !== lastSyncedKey) {
		lastSyncedKey = currentSyncKey;
		name = fromData.name ?? "";
		description = fromData.description ?? "";
		const iconValue =
			(fromData?.icon != null && String(fromData.icon).trim()) ||
			(fromStore?.icon != null && String(fromStore.icon).trim()) ||
			"";
		selectedIcon = iconValue;
	}
});

// Derived: auto db_name from collection name (lowercase + underscores)
const DB_NAME = $derived(
	name
		? name
				.toLowerCase()
				.replace(/\s+/g, "_")
				.replace(/[^a-z0-9_]/g, "")
		: ""
);

// Update collection store when icon changes
$effect(() => {
	const currentIcon = selectedIcon;
	untrack(() => {
		if (collection.value && currentIcon !== collection.value.icon) {
			setCollection({ ...collection.value, icon: currentIcon });
		}
	});
});

// Sync all fields into the collection store
$effect(() => {
	const currentName = name;
	const currentDescription = description;
	const currentIcon = selectedIcon;

	untrack(() => {
		if (!collection.value) return;
		if (
			collection.value.name === currentName &&
			collection.value.description === currentDescription &&
			collection.value.icon === currentIcon
		)
			return;

		setCollection({
			...collection.value,
			name: currentName,
			description: currentDescription,
			icon: currentIcon,
		});
	});
});
</script>

<div class="space-y-6">
	<!-- Section Header -->
	<div class="flex items-center gap-3">
		<iconify-icon icon="mdi:information-outline" width="24" class="text-primary-500"></iconify-icon>
		<div>
			<h2 class="text-xl font-bold text-surface-900 dark:text-surface-100">Collection Definition</h2>
			<p class="text-sm text-surface-500 dark:text-surface-400">Configure the core identity of your collection</p>
		</div>
	</div>

	<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
		<!-- Left: Name & Database ID -->
		<Card class="p-6">
			<h3 class="text-base font-semibold text-surface-900 dark:text-surface-100 mb-4 flex items-center gap-2">
				<iconify-icon icon="mdi:form-textbox" width="18" class="text-tertiary-500"></iconify-icon>
				Identity
			</h3>

			<div class="space-y-4">
				<Input
					bind:value={name}
					label={collection_name()}
					placeholder={collection_name_placeholder()}
					required
					aria-label={collection_name()}
					data-testid="collection-name-input"
				/>

				{#if name}
					<div class="rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 p-3">
						<span class="text-[10px] font-bold uppercase tracking-wider text-surface-400 dark:text-surface-500 mb-1 block">
							Database Name
						</span>
						<code class="text-sm font-mono font-bold text-primary-600 dark:text-primary-400">{DB_NAME}</code>
						<p class="text-[11px] text-surface-400 mt-1">Auto-generated from collection name — used as the database table name</p>
					</div>
				{/if}
			</div>
		</Card>

		<!-- Right: Icon & Description -->
		<Card class="p-6">
			<h3 class="text-base font-semibold text-surface-900 dark:text-surface-100 mb-4 flex items-center gap-2">
				<iconify-icon icon="mdi:palette-outline" width="18" class="text-tertiary-500"></iconify-icon>
				Visual Identity
			</h3>

			<div class="space-y-5">
				<div class="space-y-2">
					<span class="text-sm font-medium leading-none text-surface-500 dark:text-surface-50">{collectionname_labelicon()}</span>
					<IconifyIconsPicker bind:iconselected={selectedIcon} icon={selectedIcon} bind:searchQuery />
				</div>

				<div class="space-y-2">
					<label for="description" class="text-sm font-medium leading-none text-surface-500 dark:text-surface-50">{collectionname_description()}</label>
					<textarea
						id="description"
						bind:value={description}
						placeholder={collection_description_placeholder()}
						aria-label="Collection description"
						class="w-full rounded border border-surface-300 dark:border-surface-600 bg-surface-50 dark:bg-surface-900 p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 resize-none min-h-32"
					></textarea>
				</div>
			</div>
		</Card>
	</div>
</div>
