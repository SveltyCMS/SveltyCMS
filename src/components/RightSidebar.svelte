<!-- 
@file src/components/RightSidebar.svelte
@description RightSidebar component. 
-->

<script lang="ts">
	// Stores
	import { collection, collectionValue, mode, modifyEntry, saveLayerStore, shouldShowNextButton, entryData } from '@stores/store';
	import { handleSidebarToggle } from '@src/stores/sidebarStore';
	import { page } from '$app/stores';
	import { saveFormData, convertTimestampToDateString } from '@utils/utils';

	// Auth
	import type { User } from '@src/auth/types';
	const user: User = $page.data.user;

	// Components
	import Toggles from './system/inputs/Toggles.svelte';
	import ScheduleModal from './ScheduleModal.svelte';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';
	import { languageTag } from '@src/paraglide/runtime';

	// Skeleton
	import { getModalStore, Autocomplete, popup } from '@skeletonlabs/skeleton';
	import type { AutocompleteOption, ModalComponent, ModalSettings, PopupSettings } from '@skeletonlabs/skeleton';
	import { roles } from '@root/config/permissions';
	import { authAdapter, dbAdapter } from '@src/databases/db';

	const modalStore = getModalStore();

	// Modal Trigger - Schedule
	function openScheduleModal(): void {
		// console.log('Triggered - modalUserForm');
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
					schedule = r.date;
					// Handle the scheduled action (r.action) as needed
				}
			}
		};
		modalStore.trigger(d);
	}

	let next = () => {};
	saveLayerStore.subscribe((value) => {
		next = value;
		shouldShowNextButton.set(false);
	});

	// Map the status to boolean
	let isPublished = $entryData?.status === 'published';
	let inputPopupUser = '';
	let schedule = $entryData._scheduled ? new Date($entryData._scheduled).toISOString().slice(0, 16) : '';

	// Function to toggle the status
	function toggleStatus() {
		isPublished = !isPublished;
		$entryData.status = isPublished ? 'published' : 'unpublished';
		$entryData.updatedAt = new Date();
		$entryData.save();
	}

	// Convert timestamp to Date string
	$: dates = {
		created: convertTimestampToDateString($entryData.createdAt),
		updated: convertTimestampToDateString($entryData.updatedAt)
	};

	// Save data
	async function saveData() {
		await saveFormData({
			data: $collectionValue,
			_collection: $collection,
			_mode: $mode,
			dbAdapter: dbAdapter,
			authAdapter: authAdapter,
			user_id: user._id,
			user: user
		});
		mode.set('view');
		handleSidebarToggle();
	}

	// TODO: user autocomplete
	const Userlist = roles.map((role) => ({
		label: role.name,
		value: role.name,
		keywords: role.description
	}));

	const popupSettingsUser: PopupSettings = {
		event: 'focus-click',
		target: 'popupAutocomplete',
		placement: 'right'
	};

	function onPopupUserSelect(event: CustomEvent<any>) {
		console.log(event.detail);
		throw new Error('Function not implemented.');
	}
</script>

<!-- Desktop Right Sidebar -->
<!-- Check if user has create or write permission -->
{#if ['edit', 'create'].includes($mode) || $collection.permissions?.[user.role]?.write == false}
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
					disabled={$collection?.permissions?.[user.role]?.write == false}
					class="variant-filled-primary btn w-full gap-2"
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

				{#if $mode == 'edit'}
					<!--Clone -->
					<button
						type="button"
						on:click={() => $modifyEntry('clone')}
						disabled={$collection?.permissions?.[user.role]?.write && $collection?.permissions?.[user.role]?.create}
						class="gradient-secondary gradient-secondary-hover gradient-secondary-focus btn w-full gap-2 text-white"
					>
						<iconify-icon icon="bi:clipboard-data-fill" width="24" />Clone<span class="text-primary-500">{$collection?.name}</span>
					</button>
				{/if}

				{#if $mode == 'edit'}
					<button
						type="button"
						on:click={() => $modifyEntry('delete')}
						disabled={$collection?.permissions?.[user.role]?.delete}
						class="variant-filled-error btn w-full"
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
						/>
						<div data-popup="popupAutocomplete">
							<Autocomplete bind:input={inputPopupUser} options={Userlist} on:selection={onPopupUserSelect} />
						</div>
					</div>
				</div>

				<!-- Scheduled on -->
				<div class="mt-2 flex w-full flex-col items-start justify-center">
					<p class="mb-1">{m.sidebar_authoredon()}</p>
					<button class="variant-filled-surface w-full p-2 text-left text-sm" on:click={openScheduleModal}>
						{schedule ? new Date(schedule).toLocaleString() : 'Schedule publication'}
					</button>
				</div>
			</main>

			{#if $mode == 'create'}
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
