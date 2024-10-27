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
	import { getFieldName, saveFormData } from '@utils/utils';

	// Components
	import TranslationStatus from './TranslationStatus.svelte';
	import ScheduleModal from './ScheduleModal.svelte';

	// Skeleton
	import { getModalStore, type ModalComponent, type ModalSettings } from '@skeletonlabs/skeleton';
	const modalStore = getModalStore();

	// Modal Trigger - Schedule
	function openScheduleModal(): void {
		// console.log('Triggered - modalScheduleForm');
		const modalComponent: ModalComponent = {
			// Pass a reference to your custom component
			ref: ScheduleModal,
			// Provide default slot content as a template literal
			slot: '<p>Edit Form</p>'
		};

		const d: ModalSettings = {
			type: 'component',
			// NOTE: title, body, response, etc are supported!
			title: 'Scheduler',
			body: 'Set a date and time to schedule this entry.',
			component: modalComponent,
			// Pass arbitrary data to the component
			response: (r: { date: string; action: string } | boolean) => {
				if (typeof r === 'object') {
					const schedule = r.date;
					// Handle the scheduled action (r.action) as needed
				}
			}
		};
		modalStore.trigger(d);
	}

	// Stores
	import { get } from 'svelte/store';
	import { page } from '$app/stores';
	import { contentLanguage, saveLayerStore, headerActionButton, shouldShowNextButton, tabSet, validationStore } from '@stores/store';
	import { collection, categories, collectionValue, mode, modifyEntry } from '@stores/collectionStore';
	import { toggleSidebar, sidebarState, handleSidebarToggle } from '@stores/sidebarStore';
	import { screenSize } from '@stores/screenSizeStore';

	// Auth
	import type { User } from '@src/auth/types';
	const user: User = $page.data.user;

	let previousLanguage = get(contentLanguage);
	let previousTabSet = get(tabSet);
	let tempData = {};

	//ParaglideJS
	import * as m from '@src/paraglide/messages';
	import { logger } from '@src/utils/logger';

	$: {
		if ($tabSet !== previousTabSet) {
			tempData[previousLanguage] = get(collectionValue);
			previousTabSet = $tabSet;
		}
	}

	$: {
		if ($mode === 'view') {
			tempData = {};
		}
		if ($mode === 'edit' && $collectionValue.status === 'published') {
			$modifyEntry('unpublished');
		}
	}

	// Type guard to check if the widget has a validateWidget method
	function hasValidateWidget(widget: any): widget is { validateWidget: () => Promise<string | null> } {
		return typeof widget?.validateWidget === 'function';
	}

	// Type guard to check if field is translatable
	function isTranslatable(field: any): boolean {
		return 'translated' in field && field.translated === true;
	}

	// Save form data with validation
	async function saveData() {
		let validationPassed = true;

		// Access the fields property of the collection
		const fields = $collection.fields;
		const getData = {};

		// Get current language
		const currentLanguage = get(contentLanguage);

		// Validate all fields and prepare getData object
		for (const field of fields) {
			const fieldName = getFieldName(field);
			if (hasValidateWidget(field.widget)) {
				const error = await field.widget.validateWidget();
				if (error) {
					validationStore.setError(fieldName, error);
					validationPassed = false;
				} else {
					validationStore.clearError(fieldName);
					getData[fieldName] = () => {
						const value = $collectionValue[fieldName];
						// Initialize language object if field is translated
						if (isTranslatable(field) && typeof value !== 'object') {
							return { [currentLanguage]: value };
						}
						return value;
					};
				}
			} else {
				// If no validation widget, still collect the data
				getData[fieldName] = () => {
					const value = $collectionValue[fieldName];
					// Initialize language object if field is translated
					if (isTranslatable(field) && typeof value !== 'object') {
						return { [currentLanguage]: value };
					}
					return value;
				};
			}
		}

		// If validation passed, save the data
		if (validationPassed) {
			try {
				logger.debug('Saving data...', `${JSON.stringify(getData)}`);
				await saveFormData({
					data: getData,
					_collection: $collection,
					_mode: $mode,
					id: $collectionValue._id ?? '',
					user
				});

				mode.set('view');
				handleSidebarToggle();
			} catch (err) {
				console.error('Failed to save data:', err);
			}
		}
	}

	// function to undo the changes made by handleButtonClick
	function handleCancel() {
		mode.set('view');
		handleSidebarToggle();
	}

	function handleReload() {
		mode.set('edit');
	}

	export let showMore = false;
	$: if ($mode === 'edit' || $mode === 'create') {
		showMore = false;
	}

	let next = () => {};
	saveLayerStore.subscribe((value) => {
		next = value;
		shouldShowNextButton.set(false);
	});
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
				on:keydown
				on:click={() => toggleSidebar('left', get(screenSize) === 'lg' ? 'full' : 'collapsed')}
				class="variant-ghost-surface btn-icon mt-1"
			>
				<iconify-icon icon="mingcute:menu-fill" width="24" />
			</button>
		{/if}

		<!-- Collection type with icon -->
		<div class="flex {!$sidebarState.left ? 'ml-2' : 'ml-1'}">
			{#if $collection && $collection.icon}
				<div class="flex items-center justify-center">
					<iconify-icon icon={$collection.icon} width="24" class="text-error-500" />
				</div>
			{/if}

			<!--TODO: fix {#if $categories && $categories[0]} -->
			{#if $categories && $categories[0]}
				<div class="ml-2 flex flex-col text-left text-gray-400 dark:text-gray-300">
					<div class="text-sm font-bold uppercase text-tertiary-500 dark:text-primary-500">{$mode}:</div>
					<div class="text-xs capitalize">
						{$categories[0].name}
						<span class="uppercase text-tertiary-500 dark:text-primary-500">{$collection?.name}</span>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<div class="flex items-center justify-end gap-1 sm:gap-2 md:gap-4">
		<!-- Check if user role has access to collection -->
		<!-- mobile mode -->
		{#if $screenSize !== 'lg'}
			{#if $shouldShowNextButton}
				<!-- Next Button  -->
				<button type="button" on:click={next} class="variant-filled-tertiary btn-icon dark:variant-filled-primary md:btn">
					<iconify-icon icon="carbon:next-filled" width="24" class="text-white" />
					<span class="hidden md:block">{m.button_next()}</span>
				</button>
			{:else}
				<!-- Mobile Content Language -->
				<div class=" flex-col items-center justify-center md:flex">
					<TranslationStatus />
				</div>

				<!-- Save Content -->
				{#if ['edit', 'create'].includes($mode)}
					<button type="button" on:click={saveData} class="variant-filled-tertiary btn-icon dark:variant-filled-primary md:hidden">
						<iconify-icon icon="material-symbols:save" width="24" class="text-white" />
					</button>
				{/if}

				<!-- DropDown to show more Buttons -->
				<button type="button" on:keydown on:click={() => (showMore = !showMore)} class="variant-ghost-surface btn-icon">
					<iconify-icon icon="material-symbols:filter-list-rounded" width="30" />
				</button>
			{/if}
		{:else}
			<!-- Desktop Content Language -->
			<div class="hidden flex-col items-center justify-center md:flex">
				<TranslationStatus />
			</div>
		{/if}

		<!-- TODO: fix button icon switch -->
		<!-- Cancel/Reload -->
		{#if !$headerActionButton}
			<button type="button" on:click={handleCancel} class="variant-ghost-surface btn-icon">
				<iconify-icon icon="material-symbols:close" width="24" />
			</button>
		{:else}
			<button type="button" on:click={handleReload} class="variant-ghost-surface btn-icon">
				<iconify-icon icon="fa:refresh" width="24" class="text-tertiary-500 dark:text-primary-500" />
			</button>
		{/if}
	</div>
</header>

{#if showMore}
	<div class="-mx-2 mb-2 flex items-center justify-center gap-3 pt-2">
		<div class="flex flex-col items-center justify-center">
			<!-- Delete Content -->
			<!-- disabled={!$collection?.permissions?.[userRole]?.delete} -->
			<button type="button" on:click={() => $modifyEntry('deleted')} class="gradient-error gradient-error-hover gradient-error-focus btn-icon">
				<iconify-icon icon="icomoon-free:bin" width="24" />
			</button>
		</div>

		<!-- Clone Content -->
		{#if $mode == 'edit'}
			{#if $collectionValue.status == 'unpublished'}
				<div class="flex flex-col items-center justify-center">
					<button
						type="button"
						on:click={() => $modifyEntry('published')}
						disabled={!($collection?.permissions?.[user.role]?.write && $collection?.permissions?.[user.role]?.create)}
						class="gradient-tertiary gradient-tertiary-hover gradient-tertiary-focus btn-icon"
					>
						<iconify-icon icon="bi:hand-thumbs-up-fill" width="24" />
					</button>
				</div>

				<div class="flex flex-col items-center justify-center">
					<button
						type="button"
						on:click={openScheduleModal}
						disabled={!$collection?.permissions?.[user.role]?.write}
						class="gradient-pink gradient-pink-hover gradient-pink-focus btn-icon"
					>
						<iconify-icon icon="bi:clock" width="24" />
					</button>
				</div>
			{:else}
				<div class="flex flex-col items-center justify-center">
					<button
						type="button"
						on:click={() => $modifyEntry('unpublished')}
						disabled={!$collection?.permissions?.[user.role]?.write}
						class="gradient-yellow gradient-yellow-hover gradient-yellow-focus btn-icon"
					>
						<iconify-icon icon="bi:pause-circle" width="24" />
					</button>
				</div>
			{/if}

			<div class="flex flex-col items-center justify-center">
				<button
					type="button"
					on:click={() => $modifyEntry('scheduled')}
					disabled={!$collection?.permissions?.[user.role]?.write}
					class="gradient-pink gradient-pink-hover gradient-pink-focus btn-icon"
				>
					<iconify-icon icon="bi:clock" width="24" />
				</button>
			</div>

			<div class="flex flex-col items-center justify-center">
				<button
					type="button"
					on:click={() => $modifyEntry('cloned')}
					disabled={!($collection?.permissions?.[user.role]?.write && $collection?.permissions?.[user.role]?.create)}
					class="gradient-secondary gradient-secondary-hover gradient-secondary-focus btn-icon"
				>
					<iconify-icon icon="bi:clipboard-data-fill" width="24" />
				</button>
			</div>
		{/if}
	</div>
{/if}
