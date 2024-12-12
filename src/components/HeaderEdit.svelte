<!-- 
 @file  src/components/HeaderEdit.svelte
 @component
 **HeaderEdit component**
 The HeaderEdit component manages the collection entry header for both "edit" and "view" modes. 
 It provides functionality for toggling sidebar visibility, saving form data, handling modal dialogs for scheduling, 
 and managing language or tab-specific temporary data. The header also adapts to mobile/desktop views 
 and offers options for actions like publishing, deleting, or scheduling entries, while maintaining accessibility and responsive design.

 ```tsx
 <HeaderEdit />
 ```

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

	// Components
	import TranslationStatus from './TranslationStatus.svelte';
	import ScheduleModal from './ScheduleModal.svelte';

	// Types
	import type { Field, Schema, CollectionData } from '@src/collections/types';

	type StatusType = NonNullable<Schema['status']>;

	// Skeleton
	import { getModalStore, type ModalComponent, type ModalSettings } from '@skeletonlabs/skeleton';
	const modalStore = getModalStore();

	// Stores
	import { page } from '$app/stores';
	import { collection, categories, collectionValue, mode, modifyEntry, statusMap } from '@root/src/stores/collectionStore.svelte';
	import { toggleSidebar, sidebarState } from '@root/src/stores/sidebarStore.svelte';
	import { screenSize } from '@root/src/stores/screenSizeStore.svelte';
	import { contentLanguage, tabSet, validationStore, headerActionButton } from '@stores/store';

	// Auth
	import type { User } from '@src/auth/types';
	let user = $derived($page.data.user as User);

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	interface Widget {
		validateWidget?: () => Promise<string | null>;
		config?: Record<string, unknown>;
		type?: string;
		[key: string]: unknown;
	}

	// Extend Field with translated property
	interface TranslatableField extends Field {
		translated: true;
	}

	interface SaveData {
		[key: string]: () => string | number | boolean | Record<string, any> | undefined;
	}

	interface ScheduleResponse {
		date: string;
		action: string;
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

	// State declarations
	let previousLanguage = $state($contentLanguage);
	let previousTabSet = $state($tabSet);
	let tempData = $state<Partial<Record<string, CollectionData>>>({});
	let schedule = $state<string>(
		typeof collectionValue.value?._scheduled === 'number' ? new Date(collectionValue.value._scheduled).toISOString().slice(0, 16) : ''
	);
	let createdAtDate = $state<string>(
		typeof collectionValue.value?.createdAt === 'number' ? new Date(collectionValue.value.createdAt * 1000).toISOString().slice(0, 16) : ''
	);
	let saveLayerStore = $state<() => Promise<void>>(async () => {});
	let showMore = $state(false);
	let next = $state<() => Promise<void>>(() => Promise.resolve());

	// Compute category name using derived state
	let categoryName = $derived(
		(() => {
			const categoryEntries = Object.values(categories.value || {});
			const cat = categoryEntries.find((cat: CollectionData) => cat.collections?.some((col: Schema) => col.name === collection.value?.name));
			return cat?.name || '';
		})()
	);

	// Type guard to check if the widget result has a validateWidget method
	function hasValidateWidget(widgetInstance: Widget): widgetInstance is Required<Pick<Widget, 'validateWidget'>> {
		return typeof widgetInstance?.validateWidget === 'function';
	}

	// Type guard to check if field is translatable
	function isTranslatable(field: Field): field is TranslatableField {
		return 'translated' in field && (field as any).translated === true;
	}

	// Modal Trigger - Schedule
	function openScheduleModal(): void {
		const modalComponent: ModalComponent = {
			ref: ScheduleModal,
			slot: '<p>Edit Form</p>'
		};

		const modalSettings: ModalSettings = {
			type: 'component',
			title: 'Scheduler',
			body: 'Set a date and time to schedule this entry.',
			component: modalComponent,
			response: (r: ScheduleResponse | boolean) => {
				if (typeof r === 'object' && 'date' in r) {
					schedule = r.date;
					if (r.action === 'schedule') {
						const newValue = {
							...collectionValue.value,
							status: statusMap.scheduled as StatusType,
							_scheduled: new Date(r.date).getTime()
						};
						collectionValue.set(newValue);
					}
				}
			}
		};
		modalStore.trigger(modalSettings);
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
				typeof rawValue === 'object' && rawValue !== null ? (rawValue as Record<string, any>) : (rawValue as string | number | boolean | undefined);
			const widgetInstance = field.widget as unknown as { validateWidget?: () => Promise<string | null> };

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
				console.debug('Saving data...', `${JSON.stringify({ mode: mode.value, collection: collection.value.name })}`);

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
		{#if sidebarState.sidebar.value.left === 'hidden'}
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
		<div class="flex {!sidebarState.sidebar.value.left ? 'ml-2' : 'ml-1'}">
			{#if collection.value && collection.value.icon}
				<div class="flex items-center justify-center">
					<iconify-icon icon={collection.value.icon} width="24" class="text-error-500"></iconify-icon>
				</div>
			{/if}

			{#if collection.value?.name && categories.value}
				<div class="ml-2 flex flex-col text-left text-gray-400 dark:text-gray-300">
					<div class="text-sm font-bold uppercase text-tertiary-500 dark:text-primary-500">{mode.value}:</div>
					<div class="text-xs capitalize">
						{categoryName}
						<span class="uppercase text-tertiary-500 dark:text-primary-500">{collection.value.name}</span>
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
				{#if ['edit', 'create'].includes(mode.value)}
					<button
						type="button"
						onclick={saveData}
						disabled={collection.value?.permissions?.[user.role]?.write === false}
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
				<p>Created by: {collectionValue.value?.createdBy || user.username}</p>
				{#if collectionValue.value?.updatedBy}
					<p class="text-tertiary-500">Last updated by {collectionValue.value.updatedBy}</p>
				{/if}
			</div>
		</div>
	</div>
{/if}
