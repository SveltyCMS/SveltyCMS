<!-- 
 @file  src/components/HeaderEdit.svelte
 @description  HeaderEdit component manages the collection entry header for both "edit" and "view" modes. It provides functionality for toggling sidebar visibility, saving form data, handling modal dialogs for scheduling, and managing language or tab-specific temporary data. The header also adapts to mobile/desktop views and offers options for actions like publishing, deleting, or scheduling entries, while maintaining accessibility and responsive design.

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
	import { getFieldName, saveFormData, meta_data } from '@utils/utils';
	import { publicEnv } from '@root/config/public';

	// Components
	import TranslationStatus from './TranslationStatus.svelte';
	import ScheduleModal from './ScheduleModal.svelte';

	// Types
	import type { CategoryData } from '@src/collections/types';
	import type { CollectionValue } from '@stores/collectionStore';

	// Skeleton
	import { getModalStore, type ModalComponent, type ModalSettings } from '@skeletonlabs/skeleton';
	const modalStore = getModalStore();

	// Stores
	import { page } from '$app/stores';
	import { collection, categories, collectionValue, mode, modifyEntry, statusMap } from '@stores/collectionStore';
	import { toggleSidebar, sidebarState } from '@stores/sidebarStore';
	import { screenSize } from '@stores/screenSizeStore';
	import { contentLanguage, tabSet, validationStore, headerActionButton } from '@stores/store';

	// Auth
	import type { User } from '@src/auth/types';
	let user = $derived($page.data.user as User);

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// State declarations
	let isOpen = $state(false);
	let previousLanguage = $state($contentLanguage);
	let previousTabSet = $state($tabSet);
	let tempData = $state({});
	let schedule = $state($collectionValue?._scheduled ? new Date($collectionValue._scheduled).toISOString().slice(0, 16) : '');
	let createdAtDate = $state($collectionValue?.createdAt ? new Date($collectionValue.createdAt * 1000).toISOString().slice(0, 16) : '');
	let saveLayerStore = $state(async () => {});
	let showMore = $state(false);
	let next = $state(() => {});

	// Modal Trigger - Schedule
	function openScheduleModal(): void {
		const modalComponent: ModalComponent = {
			ref: ScheduleModal,
			slot: '<p>Edit Form</p>'
		};

		const d: ModalSettings = {
			type: 'component',
			title: 'Scheduler',
			body: 'Set a date and time to schedule this entry.',
			component: modalComponent,
			response: (r: { date: string; action: string } | boolean) => {
				if (typeof r === 'object') {
					schedule = r.date;
					if (r.action === 'schedule') {
						const newValue: CollectionValue = {
							...$collectionValue,
							status: statusMap.scheduled,
							_scheduled: new Date(r.date).getTime()
						};
						collectionValue.set(newValue);
					}
				}
			}
		};
		modalStore.trigger(d);
	}

	// Find the parent category name for the current collection
	let categoryName = $derived(
		(() => {
			if (!$collection?.name || !$categories) return '';

			// Helper function to find parent category name
			const findParentCategory = (categories: Record<string, CategoryData>): string => {
				// Only process root categories (Collections and Menu)
				for (const [rootName, rootCategory] of Object.entries(categories)) {
					if (rootName !== 'Collections' && rootName !== 'Menu') continue;

					if (rootCategory.subcategories) {
						// Check each subcategory
						for (const [subName, subCat] of Object.entries(rootCategory.subcategories as Record<string, CategoryData>)) {
							// Case 1: Direct collection in subcategories (like Media, Names)
							if (subCat.isCollection && subName === $collection.name) {
								return rootCategory.name;
							}

							// Case 2: Collection in nested subcategories (like Posts/Posts)
							if (!subCat.isCollection && subCat.subcategories) {
								for (const [nestedName, nestedCat] of Object.entries(subCat.subcategories as Record<string, CategoryData>)) {
									if (nestedCat.isCollection && nestedName === $collection.name) {
										// Return the immediate parent name (e.g. "Posts" for Posts/Posts)
										return subCat.name;
									}
								}
							}
						}
					}
				}
				return '';
			};

			return findParentCategory($categories);
		})()
	);

	$effect(() => {
		if ($tabSet !== previousTabSet) {
			tempData[previousLanguage] = $collectionValue;
			previousTabSet = $tabSet;
		}
	});

	$effect(() => {
		if ($mode === 'view') {
			tempData = {};
		}
		if ($mode === 'edit' && $collectionValue?.status === statusMap.published) {
			$modifyEntry?.(statusMap.unpublished);
		}
	});

	$effect(() => {
		if ($mode === 'edit' || $mode === 'create') {
			showMore = false;
		}
	});

	$effect(() => {
		next = saveLayerStore;
	});

	// Type guard to check if the widget result has a validateWidget method
	function hasValidateWidget(widgetInstance: any): widgetInstance is { validateWidget: () => Promise<string | null> } {
		return typeof widgetInstance?.validateWidget === 'function';
	}

	// Type guard to check if field is translatable
	function isTranslatable(field: any): boolean {
		return 'translated' in field && field.translated === true;
	}

	// Save form data with validation
	async function saveData() {
		if (!$collection) return;

		let validationPassed = true;
		const getData = {};

		// Clear any existing meta_data
		meta_data.clear();

		// Validate all fields and collect data
		for (const field of $collection.fields) {
			const fieldName = getFieldName(field);
			const fieldValue = $collectionValue?.[fieldName];
			// Use widget property directly as it's now an instance
			const widgetInstance = field.widget;

			if (hasValidateWidget(widgetInstance)) {
				const error = await widgetInstance.validateWidget();
				if (error) {
					validationStore.setError(fieldName, error);
					validationPassed = false;
				} else {
					validationStore.clearError(fieldName);
					getData[fieldName] = () => {
						if (isTranslatable(field)) {
							return typeof fieldValue === 'object' ? fieldValue : { [$contentLanguage]: fieldValue };
						}
						return fieldValue;
					};
				}
			} else {
				getData[fieldName] = () => {
					if (isTranslatable(field)) {
						return typeof fieldValue === 'object' ? fieldValue : { [$contentLanguage]: fieldValue };
					}
					return fieldValue;
				};
			}
		}

		// Add system fields
		if ($mode === 'create') {
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
		if ($mode === 'edit' && $collectionValue?._id) {
			getData['_id'] = () => $collectionValue._id;
		}

		// Add status
		getData['status'] = () => $collectionValue?.status || statusMap.unpublished;

		// Add schedule if set
		if (schedule) {
			getData['_scheduled'] = () => new Date(schedule).getTime();
		}

		// If validation passed, save the data
		if (validationPassed) {
			try {
				console.debug('Saving data...', `${JSON.stringify({ mode: $mode, collection: $collection.name })}`);

				await saveFormData({
					data: getData,
					_collection: $collection,
					_mode: $mode,
					id: $collectionValue?._id,
					user
				});

				mode.set('view');
				toggleSidebar('left', $screenSize === 'lg' ? 'full' : 'collapsed');
			} catch (err) {
				console.error('Failed to save data:', err);
			}
		}
	}

	// function to undo the changes made by handleButtonClick
	function handleCancel() {
		mode.set('view');
		toggleSidebar('left', $screenSize === 'lg' ? 'full' : 'collapsed');
	}

	function handleReload() {
		mode.set('edit');
	}

	// Handle entry modifications
	function handleModifyEntry(status: keyof typeof statusMap) {
		$modifyEntry?.(status);
	}
</script>

<header
	class="sticky top-0 z-10 flex w-full items-center justify-between {showMore
		? ''
		: 'border-b'} border-secondary-600-300-token bg-white p-2 dark:bg-surface-700"
>
	<div class="flex items-center justify-start">
		<!-- Hamburger -->
		{#if $sidebarState.left === 'hidden'}
			<button
				type="button"
				onclick={() => toggleSidebar('left', $screenSize === 'lg' ? 'full' : 'collapsed')}
				aria-label="Toggle Sidebar"
				class="variant-ghost-surface btn-icon mt-1"
			>
				<iconify-icon icon="mingcute:menu-fill" width="24"></iconify-icon>
			</button>
		{/if}

		<!-- Collection type with icon -->
		<div class="flex {!$sidebarState.left ? 'ml-2' : 'ml-1'}">
			{#if $collection && $collection.icon}
				<div class="flex items-center justify-center">
					<iconify-icon icon={$collection.icon} width="24" class="text-error-500"></iconify-icon>
				</div>
			{/if}

			{#if $collection?.name && $categories}
				<div class="ml-2 flex flex-col text-left text-gray-400 dark:text-gray-300">
					<div class="text-sm font-bold uppercase text-tertiary-500 dark:text-primary-500">{$mode}:</div>
					<div class="text-xs capitalize">
						{categoryName}
						<span class="uppercase text-tertiary-500 dark:text-primary-500">{$collection.name}</span>
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
				<button type="button" onclick={next} aria-label="Next" class="variant-filled-tertiary btn-icon dark:variant-filled-primary md:btn">
					<iconify-icon icon="carbon:next-filled" width="24" class="text-white"></iconify-icon>
					<span class="hidden md:block">{m.button_next()}</span>
				</button>
			{:else}
				<!-- Mobile Content Language -->
				<div class=" flex-col items-center justify-center md:flex">
					<TranslationStatus />
				</div>

				<!-- Save Content -->
				{#if ['edit', 'create'].includes($mode)}
					<button
						type="button"
						onclick={saveData}
						disabled={$collection?.permissions?.[user.role]?.write === false}
						class="variant-filled-tertiary btn-icon dark:variant-filled-primary md:hidden"
						aria-label="Save entry"
					>
						<iconify-icon icon="material-symbols:save" width="24" class="text-white"></iconify-icon>
					</button>
				{/if}

				<!-- DropDown to show more Buttons -->
				<button type="button" onclick={() => (showMore = !showMore)} aria-label="Show more" class="variant-ghost-surface btn-icon">
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
			<button type="button" onclick={handleCancel} aria-label="Cancel" class="variant-ghost-surface btn-icon">
				<iconify-icon icon="material-symbols:close" width="24"></iconify-icon>
			</button>
		{:else}
			<button type="button" onclick={handleReload} aria-label="Reload" class="variant-ghost-surface btn-icon">
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
					disabled={$collection?.permissions?.[user.role]?.delete === false}
					class="gradient-error gradient-error-hover gradient-error-focus btn-icon"
					aria-label="Delete entry"
				>
					<iconify-icon icon="icomoon-free:bin" width="24"></iconify-icon>
				</button>
			</div>

			<!-- Clone Content -->
			{#if $mode == 'edit'}
				{#if $collectionValue?.status == statusMap.unpublished}
					<div class="flex flex-col items-center justify-center">
						<button
							type="button"
							onclick={() => handleModifyEntry(statusMap.published)}
							disabled={!($collection?.permissions?.[user.role]?.write && $collection?.permissions?.[user.role]?.create)}
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
							disabled={!$collection?.permissions?.[user.role]?.write}
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
							disabled={!$collection?.permissions?.[user.role]?.write}
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
						disabled={!($collection?.permissions?.[user.role]?.write && $collection?.permissions?.[user.role]?.create)}
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
					class="variant-filled-surface w-full p-2 text-left text-sm"
					aria-label="Set creation date"
				/>
			</div>

			<!-- Schedule Info -->
			{#if schedule}
				<div class="mt-2 text-sm text-tertiary-500">
					Will be published on {new Date(schedule).toLocaleString()}
				</div>
			{/if}

			<!-- User Info -->
			<div class="mt-2 text-sm">
				<p>Created by: {$collectionValue?.createdBy || user.username}</p>
				{#if $collectionValue?.updatedBy}
					<p class="text-tertiary-500">Last updated by {$collectionValue.updatedBy}</p>
				{/if}
			</div>
		</div>
	</div>
{/if}
