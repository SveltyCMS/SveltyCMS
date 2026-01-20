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
	import { collection, setCollection } from '@cms/stores/collectionStore.svelte';

	// Components
	import IconifyPicker from '@cms/components/IconifyPicker.svelte';

	// ParaglideJS
	import * as m from '$paraglide/messages.js';

	// Skeleton
	import { Tooltip, Portal } from '@skeletonlabs/skeleton-svelte';

	// Tooltip styling
	const TOOLTIP_CLASS =
		'card rounded-md border border-surface-300/50 bg-surface-50 dark:bg-surface-700 dark:border-surface-600 px-3 py-2 text-sm shadow-lg text-black dark:text-white max-w-xs';

	const props = $props();

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
			if (collection.value && currentIcon !== collection.value.icon) {
				setCollection({
					...collection.value,
					icon: currentIcon,
					fields: collection.value?.fields || []
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

		// Use untrack to prevent reading collection.value from triggering this effect again
		// Use untrack to prevent reading collection.value from triggering this effect again
		untrack(() => {
			// Check if values have actually changed to avoid unnecessary updates
			if (
				collection.value?.name === currentName &&
				collection.value?.slug === currentSlug &&
				collection.value?.description === currentDescription &&
				collection.value?.status === currentStatus &&
				collection.value?.icon === currentIcon
			) {
				return;
			}

			setCollection({
				...(collection.value || {}), // Spread existing values or empty object
				name: currentName,
				slug: currentSlug,
				description: currentDescription,
				status: currentStatus,
				icon: currentIcon, // Ensure icon is updated
				fields: collection.value?.fields || []
			});
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
	import { StatusTypes } from '@cms-types';
	const statuses = Object.values(StatusTypes);
</script>

{#snippet infoTooltip(text: string)}
	<Tooltip positioning={{ placement: 'top' }}>
		<Tooltip.Trigger>
			<iconify-icon
				icon="material-symbols:info"
				width="18"
				class="ml-1 cursor-pointer text-tertiary-500 dark:text-primary-500 hover:scale-110 transition-transform"
			></iconify-icon>
		</Tooltip.Trigger>
		<Portal>
			<Tooltip.Positioner>
				<Tooltip.Content class={TOOLTIP_CLASS}>
					<span>{text}</span>
					<Tooltip.Arrow class="[--arrow-size:--spacing(2)] [--arrow-background:var(--color-surface-50)]">
						<Tooltip.ArrowTip />
					</Tooltip.Arrow>
				</Tooltip.Content>
			</Tooltip.Positioner>
		</Portal>
	</Tooltip>
{/snippet}

<!-- Single Column Layout Container -->
<div class="flex w-full flex-col">
	<!-- Form Fields Section -->
	<div class="flex flex-col gap-2 rounded border p-4">
		<!-- Collection Name -->
		<div class="flex flex-col">
			<label for="name" class="mb-1 flex items-center font-medium">
				{m.collection_name()} <span class="mx-1 text-error-500">*</span>
				{@render infoTooltip(`${m.collection_name_tooltip1()} ${m.collection_name_tooltip2()}`)}
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
		</div>

		<!-- Separator (Optional) -->
		<hr class="my-2 border-gray-300 dark:border-gray-600" />

		<p class="text-tertiary-500 dark:text-primary-500 mb-0 text-center font-bold">{m.collectionname_optional()}:</p>

		<!-- Icon -->
		<div class="flex flex-col">
			<label for="icon" class="mb-1 flex items-center font-medium">
				{m.collectionname_labelicon()}
				{@render infoTooltip(m.collection_icon_tooltip())}
			</label>
			<IconifyPicker bind:iconselected={selectedIcon} bind:searchQuery />
		</div>

		<!-- Slug -->
		<div class="flex flex-col">
			<label for="slug" class="mb-1 flex items-center font-medium">
				{m.collection_slug()}
				{@render infoTooltip(m.collection_slug_tooltip())}
			</label>
			<input type="text" id="slug" bind:value={slug} placeholder={m.collection_slug_input()} class="input w-full text-black dark:text-primary-500" />
		</div>

		<!-- Description -->
		<div class="flex flex-col">
			<label for="description" class="mb-1 flex items-center font-medium">
				{m.collectionname_description()}
				{@render infoTooltip(m.collection_description())}
			</label>
			<textarea
				id="description"
				rows="2"
				bind:value={description}
				placeholder={m.collection_description_placeholder()}
				class="input w-full text-black dark:text-primary-500"
			></textarea>
		</div>

		<!-- Status -->
		<div class="flex flex-col">
			<label for="status" class="mb-1 flex items-center font-medium">
				{m.collection_status()}
				{@render infoTooltip(m.collection_status_tooltip())}
			</label>
			<select id="status" bind:value={status} class="select w-full text-black dark:text-primary-500">
				{#each statuses as statusOption}
					<option value={statusOption}>{statusOption}</option>
				{/each}
			</select>
		</div>
	</div>
</div>
