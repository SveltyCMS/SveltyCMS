<script lang="ts">
	// Stores
	import { collection, collectionValue, mode, modifyEntry, saveLayerStore, shouldShowNextButton, entryData } from '@stores/store';
	import { handleSidebarToggle } from '@src/stores/sidebarStore';
	import { page } from '$app/stores';

	// Skeleton
	import { Autocomplete, popup } from '@skeletonlabs/skeleton';
	import type { AutocompleteOption, PopupSettings } from '@skeletonlabs/skeleton';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Components
	import Toggles from './system/inputs/Toggles.svelte';

	import { saveFormData, convertTimestampToDateString } from '@utils/utils';

	let next = () => {};
	saveLayerStore.subscribe((value) => {
		next = value;
		shouldShowNextButton.set(false);
	});

	const user = $page.data.user;

	let publishValue = $entryData.status === 'published' ? true : false;

	// Convert timestamp to Date string

	const dates = {
		created: convertTimestampToDateString($entryData.createdAt),
		updated: convertTimestampToDateString($entryData.updatedAt)
	};

	// Save data
	async function saveData() {
		await saveFormData({ data: $collectionValue });

		// a function to undo the changes made by handleButtonClick
		mode.set('view');
		//console.log('RightSidebar.svelte', $mode);
		handleSidebarToggle();
	}
	//console.log('collection', $collection);

	// TODO: Schedule
	let date = new Date();
	let schedule = '';

	// TODO: user autocomplete
	const Userlist: AutocompleteOption<string>[] = [
		{ label: 'Admin', value: 'admin', keywords: 'plain, basic', meta: { healthy: false } },
		{ label: 'Guest', value: 'guest', keywords: 'dark, white', meta: { healthy: false } },
		{ label: 'User', value: 'user', keywords: 'fruit', meta: { healthy: true } }
	];

	let inputPopupUser: string = '';

	let popupSettingsUser: PopupSettings = {
		event: 'focus-click',
		target: 'popupAutocomplete',
		placement: 'right'
	};

	function onPopupUserSelect(e: CustomEvent<AutocompleteOption<string, unknown>>): void {
		throw new Error('Function not implemented.');
	}
</script>

<!-- Desktop Right Sidebar -->
<!-- Check if user has create or write permission -->
{#if ['edit', 'create'].includes($mode) || user.role == 'admin'}
	<div class="flex h-screen w-full flex-col justify-between">
		{#if $shouldShowNextButton && $mode === 'create'}
			<button type="button" on:click={next} class="variant-filled-primary btn w-full gap-2">
				<iconify-icon icon="carbon:next-filled" width="24" class="font-extrabold text-white" />
				{m.widget_megamenu_next()}
			</button>
		{:else}
			<header class="flex flex-col items-center justify-center gap-2">
				<!-- Save button -->
				<button
					type="button"
					on:click={saveData}
					disabled={$collection?.permissions?.[user.role]?.write}
					class="variant-filled-primary btn w-full gap-2"
				>
					<iconify-icon icon="material-symbols:save" width="24" class="font-extrabold text-white" />
					Save
				</button>

				<!-- Publish/Unpublish -->
				<div class="gradient-secondary btn w-full gap-2">
					<Toggles
						label={publishValue ? 'Unpublished' : 'Published'}
						labelColor={publishValue ? 'text-error-500' : 'text-primary-500'}
						icon={publishValue ? 'ic:baseline-check-circle' : 'material-symbols:close'}
						bind:value={publishValue}
						on:toggle={() => {
							$entryData.status = publishValue ? 'unpublished' : 'published';
							$entryData.updatedAt = new Date();
							$entryData.save();
						}}
					/>
				</div>

				<!-- Revision -->
				{#if $mode == 'edit'}
					<div class="gradient-secondary btn flex w-full items-center justify-between text-white">
						Revisions:
						<div class="variant-outline-primary badge ml-2 rounded-full px-3 py-0 text-lg text-primary-500">
							<iconify-icon icon="pepicons-pop:countdown" width="18" />
							<div class="text-white">{$entryData.__v}</div>
						</div>
					</div>

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

				<!-- Promote -->
				<!-- <label class="flex items-center space-x-2">
        <p>Promote</p>
        <input class="checkbox" type="checkbox" checked />
      </label> -->
			</header>

			<!-- Publish Options -->
			<main class="mt-4 flex w-full flex-col items-center justify-center gap-2 text-left dark:text-white">
				<p class="mt-2 w-full border-b text-center font-bold uppercase text-primary-500">Publish Options:</p>

				<!--Authored by autocomplete -->
				<div class="flex flex-col">
					<p class="">Authored by:</p>
					<div class="relative z-50">
						<!-- add use:popup directive to the element that triggers the popup -->
						<input
							class="autocomplete variant-filled-surface text-sm"
							type="search"
							name="autocomplete-search"
							bind:value={inputPopupUser}
							placeholder="Search..."
							use:popup={popupSettingsUser}
						/>
						<!-- popup element should have a data-popup attribute that matches the target property in your popup settings -->
						<div data-popup="popupAutocomplete">
							<!-- ensure Autocomplete component is correctly set up -->
							<Autocomplete bind:input={inputPopupUser} options={Userlist} on:selection={onPopupUserSelect} />
						</div>
					</div>
				</div>

				<!--Authored on -->
				<p class="text-left">Schedule / Authored on:</p>
				<input type="datetime-local" bind:value={schedule} class="variant-filled-surface text-sm" />
			</main>

			<footer class="mb-1 mt-2">
				{#each Object.entries(dates) as [key, value]}
					<div class="flex items-center gap-x-2 text-[12px]">
						<!-- Labels -->
						<div class="capitalize">{key}:</div>
						<!-- Data -->
						<div class="text-primary-500">{value}</div>
					</div>
				{/each}
			</footer>
		{/if}
	</div>
{/if}
