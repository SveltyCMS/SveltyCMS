<!-- 
 @file  src/components/HeaderEdit.svelte
 @component
 **HeaderEdit component**
 The HeaderEdit component manages the collection entry header for both "edit" and "view" modes. 
 It provides functionality for toggling sidebar visibility, saving form data, handling modal dialogs for scheduling, 
 and managing language or tab-specific temporary data. The header also adapts to mobile/desktop views 
 and offers options for actions like publishing, deleting, or scheduling entries, while maintaining accessibility and responsive design.

 @example
 <HeaderEdit />

 #### Props:
 - `collection` {object} - Collection object

 Features:
 - Sidebar toggle (for mobile/desktop)
 - Collection entry management with mode switching (view/edit)
 - Save form data with validation
 - Modal dialogs for scheduling entries
 - Language and tab-specific temporary data management
 - Responsive UI with adaptive actions for mobile and desktop
 - Role-based permissions handling for actions (publish, delete, etc.)
 - Accessible icons and buttons using ARIA attributes
 - Debounced "Show More" actions for performance optimization
 - Cancel and reload functionality for editing mode
 - Full dark mode support with theme-based styling
-->

<script lang="ts">
	import { getFieldName, meta_data } from '@utils/utils';
	import { saveFormData } from '../utils/data';

	// Types
	import type { Schema, Field } from '@src/content/types';
	import type { ContentStructureNode } from '@src/databases/dbInterface';

	// Components
	import TranslationStatus from '@components/TranslationStatus.svelte';

	// Modal
	import ScheduleModal from '@components/ScheduleModal.svelte';
	let isScheduleModalOpen = $state(false);

	// Modal Trigger - Schedule
	function openScheduleModal(): void {
		isScheduleModalOpen = true; // Simply set the state to true
	}

	// Stores
	import { page } from '$app/state';
	import { collection, collectionValue, mode, modifyEntry, statusMap, contentStructure } from '@src/stores/collectionStore.svelte';
	import { toggleUIElement, uiStateManager } from '@root/src/stores/UIStore.svelte';
	import { screenSize } from '@src/stores/screenSizeStore.svelte';
	import { contentLanguage, tabSet, validationStore, headerActionButton } from '@stores/store.svelte';

	// Define StatusType based on statusMap keys
	type StatusType = keyof typeof statusMap;

	// Auth
	import type { User } from '@src/auth/types';
	let user = $derived(page.data.user as User);

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	interface SaveData {
		[key: string]: () => string | number | boolean | Record<string, any> | null | undefined; // Allow null
	}

	interface CollectionData extends Record<string, any> {
		_id?: string;
		status?: StatusType;
		_scheduled?: number;
		createdAt?: number;
		updatedAt?: number;
		createdBy?: string;
		updatedBy?: string;
	}

	// State declarations with proper types
	let previousLanguage = $state<string>($contentLanguage);
	let previousTabSet = $state<number>($tabSet);
	let tempData = $state<Partial<Record<string, CollectionData>>>({});
	let schedule = $state<string>(
		typeof collectionValue.value?._scheduled === 'number' ? new Date(Number(collectionValue.value._scheduled)).toISOString().slice(0, 16) : ''
	);
	let createdAtDate = $state<string>(
		typeof collectionValue.value?.createdAt === 'number' ? new Date(Number(collectionValue.value.createdAt) * 1000).toISOString().slice(0, 16) : ''
	);
	let saveLayerStore = $state<() => Promise<void>>(async () => {});
	let showMore = $state<boolean>(false);
	let next = $state<() => Promise<void>>(() => Promise.resolve());

	// Compute category name using derived state
	let categoryName = $derived(
		(() => {
			const categoryEntries = Object.values(contentStructure.value || {}) as ContentStructureNode[]; // Cast to ContentStructureNode[]
			// Use ContentStructureNode type in find callback and check children
			const cat = categoryEntries.find(
				(catNode: ContentStructureNode) =>
					catNode.nodeType === 'category' && catNode.children?.some((col: ContentStructureNode) => col.name === collection.value?.name)
			);
			return cat?.name || '';
		})()
	);

	// Type guard to check if the widget result has a validateWidget method
	// Adjusted to accept 'any' since the local Widget interface was removed
	function hasValidateWidget(widgetInstance: any): widgetInstance is { validateWidget: () => Promise<string | null> } {
		return typeof widgetInstance?.validateWidget === 'function';
	}

	// Type guard to check if field is translatable (adjusted for imported Field type)
	function isTranslatable(field: Field): boolean {
		// Check if the 'translated' property exists and is true
		return !!(field as any).translated;
	}

	$effect(() => {
		if ($tabSet !== previousTabSet) {
			tempData[previousLanguage] = collectionValue.value;
			previousTabSet = $tabSet;
		}
	});

	$effect(() => {
		if (mode.value === 'view') {
			tempData = {};
		}
		if (mode.value === 'edit' && collectionValue.value?.status === statusMap.published) {
			$modifyEntry?.(statusMap.unpublished);
		}
	});

	$effect(() => {
		if (mode.value === 'edit' || mode.value === 'create') {
			showMore = false;
		}
	});

	$effect(() => {
		next = saveLayerStore;
	});

	// Save form data with validation
	async function saveData() {
		if (!collection.value) return;

		let validationPassed = true;
		const getData: SaveData = {};

		// Clear any existing meta_data
		meta_data.clear();

		// Validate all fields and collect data
		for (const field of (collection.value as Schema).fields) {
			const fieldName = getFieldName(field);
			const rawValue = collectionValue.value?.[fieldName];
			const fieldValue =
				typeof rawValue === 'object' && rawValue !== null
					? (rawValue as Record<string, any>)
					: (rawValue as string | number | boolean | null | undefined); // Allow null
			const widgetInstance = field.widget;

			if (hasValidateWidget(widgetInstance)) {
				// Call validateWidget if the type guard passes
				const error = await widgetInstance.validateWidget();
				if (error) {
					validationStore.setError(fieldName, error);
					validationPassed = false;
				} else {
					validationStore.clearError(fieldName);
					// Adjusted logic for translatable fields
					getData[fieldName] = () => {
						if (isTranslatable(field)) {
							// Ensure fieldValue is treated correctly, potentially creating the language key if needed
							const currentLangValue = typeof fieldValue === 'object' && fieldValue !== null ? fieldValue[$contentLanguage] : fieldValue;
							return { ...(typeof fieldValue === 'object' && fieldValue !== null ? fieldValue : {}), [$contentLanguage]: currentLangValue };
						}
						return fieldValue;
					};
				}
			} else {
				// Adjusted logic for translatable fields
				getData[fieldName] = () => {
					if (isTranslatable(field)) {
						const currentLangValue = typeof fieldValue === 'object' && fieldValue !== null ? fieldValue[$contentLanguage] : fieldValue;
						return { ...(typeof fieldValue === 'object' && fieldValue !== null ? fieldValue : {}), [$contentLanguage]: currentLangValue };
					}
					return fieldValue;
				};
			}
		}

		// Add system fields
		if (mode.value === 'create') {
			getData['createdAt'] = () => (createdAtDate ? Math.floor(new Date(createdAtDate).getTime() / 1000) : Math.floor(Date.now() / 1000));
			getData['updatedAt'] = getData['createdAt'];
			getData['createdBy'] = () => user.username;
		} else {
			getData['updatedAt'] = () => Math.floor(Date.now() / 1000);
			getData['updatedBy'] = () => user.username;
			if (createdAtDate) {
				getData['createdAt'] = () => Math.floor(new Date(createdAtDate).getTime() / 1000);
			}
		}

		// Add ID if in edit mode
		if (mode.value === 'edit' && collectionValue.value?._id) {
			const id = collectionValue.value._id;
			getData['_id'] = () => (typeof id === 'string' ? id : String(id));
		}

		// Add status
		const status = collectionValue.value?.status;
		getData['status'] = () => (typeof status === 'string' ? status : statusMap.unpublished);

		// Add schedule if set
		if (schedule && typeof schedule === 'string' && schedule.trim() !== '') {
			getData['_scheduled'] = () => new Date(schedule).getTime();
		}

		// If validation passed, save the data
		if (validationPassed) {
			try {
				await saveFormData({
					data: getData,
					_collection: collection.value,
					_mode: mode.value,
					id:
						typeof collectionValue.value?._id === 'string'
							? collectionValue.value._id
							: collectionValue.value?._id
								? String(collectionValue.value._id)
								: undefined,
					user
				});

				mode.set('view');
				toggleUIElement('leftSidebar', $screenSize === 'lg' ? 'full' : 'collapsed');
			} catch (err) {
				console.error('Failed to save data:', err);
			}
		}
	}

	// function to undo the changes made by handleButtonClick
	function handleCancel() {
		mode.set('view');
		toggleUIElement('leftSidebar', $screenSize === 'lg' ? 'full' : 'collapsed');
	}

	function handleReload() {
		mode.set('edit');
	}

	// Handle entry modifications
	function handleModifyEntry(status: keyof typeof statusMap) {
		$modifyEntry?.(status);
	}
</script>

<!-- Add the ScheduleModal component instance -->
<ScheduleModal bind:open={isScheduleModalOpen} />

<header
	class="sticky top-0 z-10 flex w-full items-center justify-between {showMore
		? ''
		: 'border-b'} border-secondary-700-300 dark:bg-surface-700 bg-white p-2"
>
	<div class="flex items-center justify-start">
		<!-- Hamburger -->
		{#if uiStateManager.uiState.value.leftSidebar === 'hidden'}
			<button
				type="button"
				onclick={() => toggleUIElement('leftSidebar', $screenSize === 'lg' ? 'full' : 'collapsed')}
				aria-label="Toggle Sidebar"
				class="preset-tonal-surface border-surface-500 btn-icon mt-1 border"
			>
				<iconify-icon icon="mingcute:menu-fill" width="24"></iconify-icon>
			</button>
		{/if}

		<!-- Collection type with icon -->
		<div class="flex {!uiStateManager.uiState.value.leftSidebar ? 'ml-2' : 'ml-1'}">
			{#if collection.value && collection.value.icon}
				<div class="flex items-center justify-center">
					<iconify-icon icon={collection.value.icon} width="24" class="text-error-500"></iconify-icon>
				</div>
			{/if}

			{#if collection.value?.name}
				<div class="ml-2 flex flex-col text-left text-gray-400 dark:text-gray-300">
					<div class="text-tertiary-500 dark:text-primary-500 text-sm font-bold uppercase">{mode.value}:</div>
					<div class="text-xs capitalize">
						{categoryName}
						<span class="text-tertiary-500 dark:text-primary-500 uppercase">{collection.value.name}</span>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<div class="flex items-center justify-end gap-1 sm:gap-2 md:gap-4">
		<!-- Check if user role has access to collection -->
		<!-- mobile mode -->
		{#if $screenSize !== 'lg'}
			{#if showMore}
				<!-- Next Button  -->
				<button type="button" onclick={next} aria-label="Next" class="preset-filled-tertiary-500 btn-icon dark:preset-filled-primary-500 md:btn">
					<iconify-icon icon="carbon:next-filled" width="24" class="text-white"></iconify-icon>
					<span class="hidden md:block">{m.button_next()}</span>
				</button>
			{:else}
				<!-- Mobile Content Language -->
				<div class=" flex-col items-center justify-center md:flex">
					<TranslationStatus />
				</div>

				<!-- Save Content -->
				{#if ['edit', 'create'].includes(mode.value)}
					<button
						type="button"
						onclick={saveData}
						disabled={collection.value?.permissions?.[user.role]?.write === false}
						class="preset-filled-tertiary-500 btn-icon dark:preset-filled-primary-500 md:hidden"
						aria-label="Save entry"
					>
						<iconify-icon icon="material-symbols:save" width="24" class="text-white"></iconify-icon>
					</button>
				{/if}

				<!-- DropDown to show more Buttons -->
				<button
					type="button"
					onclick={() => (showMore = !showMore)}
					aria-label="Show more"
					class="preset-tonal-surface border-surface-500 btn-icon border"
				>
					<iconify-icon icon="material-symbols:filter-list-rounded" width="30"></iconify-icon>
				</button>
			{/if}
		{:else}
			<!-- Desktop Content Language -->
			<div class="hidden flex-col items-center justify-center md:flex">
				<TranslationStatus />
			</div>
		{/if}

		<!-- Cancel/Reload -->
		{#if !$headerActionButton}
			<button type="button" onclick={handleCancel} aria-label="Cancel" class="preset-tonal-surface border-surface-500 btn-icon border">
				<iconify-icon icon="material-symbols:close" width="24"></iconify-icon>
			</button>
		{:else}
			<button type="button" onclick={handleReload} aria-label="Reload" class="preset-tonal-surface border-surface-500 btn-icon border">
				<iconify-icon icon="fa:refresh" width="24" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
			</button>
		{/if}
	</div>
</header>

{#if showMore}
	<div class="-mx-2 mb-2 flex flex-col items-center justify-center gap-3 pt-2">
		<!-- Action Buttons -->
		<div class="flex items-center justify-center gap-3">
			<div class="flex flex-col items-center justify-center">
				<!-- Delete Content -->
				<button
					type="button"
					onclick={() => handleModifyEntry(statusMap.deleted)}
					disabled={collection.value?.permissions?.[user.role]?.delete === false}
					class="gradient-error gradient-error-hover gradient-error-focus btn-icon"
					aria-label="Delete entry"
				>
					<iconify-icon icon="icomoon-free:bin" width="24"></iconify-icon>
				</button>
			</div>

			<!-- Clone Content -->
			{#if mode.value == 'edit'}
				{#if collectionValue.value?.status == statusMap.unpublished}
					<div class="flex flex-col items-center justify-center">
						<button
							type="button"
							onclick={() => handleModifyEntry(statusMap.published)}
							disabled={!(collection.value?.permissions?.[user.role]?.write && collection.value?.permissions?.[user.role]?.create)}
							class="gradient-tertiary gradient-tertiary-hover gradient-tertiary-focus btn-icon"
							aria-label="Publish entry"
						>
							<iconify-icon icon="bi:hand-thumbs-up-fill" width="24"></iconify-icon>
						</button>
					</div>

					<div class="flex flex-col items-center justify-center">
						<button
							type="button"
							onclick={openScheduleModal}
							disabled={!collection.value?.permissions?.[user.role]?.write}
							class="gradient-pink gradient-pink-hover gradient-pink-focus btn-icon"
							aria-label="Schedule entry"
						>
							<iconify-icon icon="bi:clock" width="24"></iconify-icon>
						</button>
					</div>
				{:else}
					<div class="flex flex-col items-center justify-center">
						<button
							type="button"
							onclick={() => handleModifyEntry(statusMap.unpublished)}
							disabled={!collection.value?.permissions?.[user.role]?.write}
							class="gradient-yellow gradient-yellow-hover gradient-yellow-focus btn-icon"
							aria-label="Unpublish entry"
						>
							<iconify-icon icon="bi:pause-circle" width="24"></iconify-icon>
						</button>
					</div>
				{/if}

				<div class="flex flex-col items-center justify-center">
					<button
						type="button"
						onclick={() => handleModifyEntry(statusMap.cloned)}
						disabled={!(collection.value?.permissions?.[user.role]?.write && collection.value?.permissions?.[user.role]?.create)}
						aria-label="Clone entry"
						class="gradient-secondary gradient-secondary-hover gradient-secondary-focus btn-icon"
					>
						<iconify-icon icon="bi:clipboard-data-fill" width="24"></iconify-icon>
					</button>
				</div>
			{/if}
		</div>

		<!-- Info Section -->
		<div class="w-full px-4">
			<!-- Created At -->
			<div class="mt-2 flex w-full flex-col items-start justify-center">
				<p class="mb-1 text-sm">Created At</p>
				<input
					type="datetime-local"
					bind:value={createdAtDate}
					class="preset-filled-surface-500 w-full p-2 text-left text-sm"
					aria-label="Set creation date"
				/>
			</div>

			<!-- Schedule Info -->
			{#if schedule}
				<div class="text-tertiary-500 mt-2 text-sm">
					Will be published on {new Date(schedule).toLocaleString()}
				</div>
			{/if}

			<!-- User Info -->
			<div class="mt-2 text-sm">
				<p>Created by: {collectionValue.value?.createdBy || user.username}</p>
				{#if collectionValue.value?.updatedBy}
					<p class="text-tertiary-500">Last updated by {collectionValue.value.updatedBy}</p>
				{/if}
			</div>
		</div>
	</div>
{/if}
