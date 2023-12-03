<script lang="ts">
	import { collection, collectionValue, mode, modifyEntry, handleSidebarToggle, saveLayerStore, shouldShowNextButton } from '@src/stores/store';

	import { page } from '$app/stores';
	import type { User } from '@src/collections/Auth';
	import { saveFormData, getDates } from '@src/utils/utils';
	import { Autocomplete, popup } from '@skeletonlabs/skeleton';
	import type { AutocompleteOption, PopupSettings } from '@skeletonlabs/skeleton';

	let next = () => {};
	saveLayerStore.subscribe((value) => {
		shouldShowNextButton.set(false);
		next = value;
	});

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	import Toggles from './system/inputs/Toggles.svelte';
	// let publishValue = data?.entryList[index]?.status;
	let publishValue = 'false';

	let user: User = $page.data.user;

	async function saveData() {
		await saveFormData({ data: $collectionValue });

		// a function to undo the changes made by handleButtonClick
		mode.set('view');
		handleSidebarToggle();
	}
	//console.log('collection', $collection);

	let dates = { created: '', updated: '', revision: '' };

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
{#if ['edit', 'create'].includes($mode)}
	<div class="flex h-screen w-full flex-col justify-between">
		{#if $shouldShowNextButton}
			<button type="button" on:click={next} class="variant-filled-primary btn w-full gap-2">
				<iconify-icon icon="carbon:next-filled" width="24" class="font-extrabold text-white" />
				Save
			</button>
		{:else}
			<header class="flex flex-col items-center justify-center gap-2">
				<!-- Save button -->
				<button type="button" on:click={saveData} class="variant-filled-primary btn w-full gap-2">
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
					/>
				</div>

				<!-- Revision -->
				<div class="gradient-secondary btn flex w-full items-center justify-between text-white">
					Revisions:
					<div class="variant-outline-primary badge ml-2 rounded-full px-3 py-0 text-lg text-primary-500">
						<iconify-icon icon="pepicons-pop:countdown" width="18" />
						<div class="text-white">2</div>
					</div>
				</div>

				<!--Clone -->
				<button
					type="button"
					on:click={() => $modifyEntry('clone')}
					class="gradient-secondary gradient-secondary-hover gradient-secondary-focus btn w-full gap-2 text-white"
				>
					<iconify-icon icon="bi:clipboard-data-fill" width="24" />Clone<span class="text-primary-500">{$collection?.name}</span>
				</button>

				{#if $mode == 'edit'}
					<button type="button" on:click={() => $modifyEntry('delete')} class="variant-filled-error btn w-full">
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

			<footer class="-mx-1 mb-2 flex w-full flex-col items-center justify-center gap-2 dark:text-white">
				<!--Content Info -->
				<h2 class="text-center font-bold uppercase text-primary-500">Content Info:</h2>

				<div class="mt-2 grid grid-cols-3 items-center gap-x-2 text-[12px] leading-tight">
					{#each Object.keys(dates) as key}
						<div class="capitalize">{key}:</div>
					{/each}

					{#each Object.values(dates) as value}
						<div class="text-primary-500">{value}</div>
					{/each}
				</div>
			</footer>
		{/if}
	</div>
{/if}
