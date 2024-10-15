<!-- 
@file src/components/RightSidebar.svelte
@description RightSidebar component. 
-->

<script lang="ts">
	// Stores
	import { page } from '$app/stores';
	import { saveLayerStore, shouldShowNextButton, validationStore } from '@stores/store';
	import { collection, mode, modifyEntry, collectionValue } from '@stores/collectionStore';
	import { handleSidebarToggle } from '@stores/sidebarStore';
	import { saveFormData, convertTimestampToDateString, getFieldName } from '@utils/utils';

	// Auth
	import type { User } from '@src/auth/types';
	const user: User = $page.data.user;
	import { roles } from '@root/config/roles';

	// Components
	import Toggles from './system/inputs/Toggles.svelte';
	import ScheduleModal from './ScheduleModal.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';
	import { languageTag } from '@src/paraglide/runtime';

	// Skeleton
	import { getModalStore, Autocomplete, popup } from '@skeletonlabs/skeleton';
	import type { AutocompleteOption, ModalComponent, ModalSettings, PopupSettings } from '@skeletonlabs/skeleton';
	import { logger } from "@src/utils/logger";

	const modalStore = getModalStore();

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
			response: (r: { date: string; action: string } | boolean) => {
				if (typeof r === 'object') {
					schedule = r.date;
				}
			}
		};
		modalStore.trigger(modalSettings);
	}

	let next = () => {};
	saveLayerStore.subscribe((value) => {
		next = value;
		shouldShowNextButton.set(false);
	});

	// Map the status to boolean
	let isPublished = $collectionValue?.status === 'published';
	let inputPopupUser = '';
	let schedule = $collectionValue._scheduled ? new Date($collectionValue._scheduled).toISOString().slice(0, 16) : '';

	// Function to toggle the status
	function toggleStatus() {
		isPublished = !isPublished;
		collectionValue.update((cv) => ({
			...cv,
			status: isPublished ? 'published' : 'unpublished',
			updatedAt: new Date()
		}));
	}

	// Convert timestamps to date strings
	$: dates = {
		created: convertTimestampToDateString($collectionValue.createdAt),
		updated: convertTimestampToDateString($collectionValue.updatedAt)
	};

	// Type guard to check if the widget has a validateWidget method
	function hasValidateWidget(widget: any): widget is { validateWidget: () => Promise<string | null> } {
		return typeof widget?.validateWidget === 'function';
	}

	// Save form data with validation
	async function saveData() {
		let validationPassed = true;

		// Access the fields property of the collection
		const fields = $collection.fields;

		// Validate all fields
		for (const field of fields) {
			if (hasValidateWidget(field.widget)) {
				const error = await field.widget.validateWidget();
				if (error) {
					validationStore.setError(getFieldName(field), error);
					validationPassed = false;
				} else {
					validationStore.clearError(getFieldName(field));
				}
			}
		}

		// If validation passed, save the data
		if (validationPassed) {
			try {
				logger.debug('Saving data...' , `${JSON.stringify($collectionValue)}`);

				await saveFormData({
					data:	new FormData($collectionValue) ,
					_collection: $collection,
					_mode: $mode,
					id: $collectionValue._id ?? "",
					user
				});

				mode.set('view');
				handleSidebarToggle();
			} catch (err) {
				console.error('Failed to save data:', err);
			}
		}
	}

	// Autocomplete user list
	const userList: AutocompleteOption[] = roles.map((role) => ({
		label: role.name,
		value: role.name,
		keywords: role.description
	}));

	const popupSettingsUser: PopupSettings = {
		event: 'focus-click',
		target: 'popupAutocomplete',
		placement: 'right'
	};

	function onPopupUserSelect(event: CustomEvent) {
		console.log(event.detail);
		throw Error('Function not implemented.');
	}
</script>

<!-- Desktop Right Sidebar -->
<!-- Check if user has create or write permission -->
{#if ['edit', 'create'].includes($mode) || $collection.permissions?.[user.role]?.write !== false}
	<div class="flex h-full w-full flex-col justify-between px-1 py-2">
		{#if $shouldShowNextButton && $mode === 'create'}
			<button type="button" on:click={next} class="variant-filled-primary btn w-full gap-2">
				<iconify-icon icon="carbon:next-filled" width="24" class="font-extrabold text-white" />
				{m.button_next()}
			</button>
		{:else}
			<header class="flex flex-col items-center justify-center gap-2">
				<!-- Save button -->
				<button
					type="button"
					on:click={saveData}
					disabled={$collection?.permissions?.[user.role]?.write === false}
					class="variant-filled-primary btn w-full gap-2"
					aria-label="Save entry"
				>
					<iconify-icon icon="material-symbols:save" width="24" class="font-extrabold text-white" />
					Save
				</button>

				<!-- Publish/Unpublish -->
				<div class="gradient-secondary btn w-full gap-2">
					<Toggles
						label={isPublished ? 'Published' : 'Unpublished'}
						labelColor={isPublished ? 'text-primary-500' : 'text-error-500'}
						iconOn="ic:baseline-check-circle"
						iconOff="material-symbols:close"
						bind:value={isPublished}
						on:toggle={toggleStatus}
					/>
				</div>

				{#if $mode === 'edit'}
					<!-- Clone button -->
					<button
						type="button"
						on:click={() => $modifyEntry('clone')}
						disabled={!$collection?.permissions?.[user.role]?.write || !$collection?.permissions?.[user.role]?.create}
						class="gradient-secondary gradient-secondary-hover gradient-secondary-focus btn w-full gap-2 text-white"
						aria-label="Clone entry"
					>
						<iconify-icon icon="bi:clipboard-data-fill" width="24" />Clone<span class="text-primary-500">{$collection?.name}</span>
					</button>

					<!-- Delete button -->
					<button
						type="button"
						on:click={() => $modifyEntry('delete')}
						disabled={$collection?.permissions?.[user.role]?.delete === false}
						class="variant-filled-error btn w-full"
						aria-label="Delete entry"
					>
						<iconify-icon icon="icomoon-free:bin" width="24" />Delete
					</button>
				{/if}
			</header>

			<!-- Publish Options -->
			<main class="mt-2 flex w-full flex-col items-center justify-center gap-2 text-left dark:text-white">
				<p class="w-full border-b text-center font-bold uppercase text-tertiary-500 dark:text-primary-500">Publish Options:</p>

				<!-- Authored by autocomplete -->
				<div class="flex w-full flex-col items-start justify-center">
					<p class="mb-1">{m.sidebar_authoredby()}</p>
					<div class="relative z-50 w-full">
						<input
							class="autocomplete variant-filled-surface w-full text-sm"
							type="search"
							name="autocomplete-search"
							bind:value={inputPopupUser}
							placeholder="Search..."
							use:popup={popupSettingsUser}
							aria-label="Search user"
						/>
						<div data-popup="popupAutocomplete">
							<Autocomplete bind:input={inputPopupUser} options={userList} on:selection={onPopupUserSelect} />
						</div>
					</div>
				</div>

				<!-- Scheduled on -->
				<div class="mt-2 flex w-full flex-col items-start justify-center">
					<p class="mb-1">{m.sidebar_authoredon()}</p>
					<button class="variant-filled-surface w-full p-2 text-left text-sm" on:click={openScheduleModal} aria-label="Schedule publication">
						{schedule ? new Date(schedule).toLocaleString() : 'Schedule publication'}
					</button>
				</div>
			</main>

			{#if $mode === 'create'}
				<p class="mb-2 text-center text-tertiary-500 dark:text-primary-500">
					{new Date().toLocaleString(languageTag(), { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
				</p>
			{:else}
				<footer class="mb-1 mt-2">
					{#each Object.entries(dates) as [key, value]}
						<div class="flex items-center justify-center gap-2 text-[12px]">
							<!-- Labels -->
							<div class="capitalize">{key}:</div>
							<!-- Data -->
							<div class="font-bold text-tertiary-500 dark:text-primary-500">{value}</div>
						</div>
					{/each}
				</footer>
			{/if}
		{/if}
	</div>
{/if}
