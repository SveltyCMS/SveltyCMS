<script lang="ts">
	import { collection, collectionValue, mode, modifyEntry, handleSidebarToggle } from '@src/stores/store';

	import { page } from '$app/stores';
	import type { User } from '@src/collections/Auth';
	import { saveFormData, getDates, publishData, unpublishData, cloneData, scheduleData } from '@src/utils/utils';
	import { Autocomplete, popup } from '@skeletonlabs/skeleton';
	import type { AutocompleteOption, PopupSettings } from '@skeletonlabs/skeleton';

	import Toggles from './system/inputs/Toggles.svelte';

	let user: User = $page.data.user;

	async function saveData() {
		await saveFormData({ data: $collectionValue });

		// a function to undo the changes made by handleButtonClick
		mode.set('view');
		handleSidebarToggle();
	}
	// console.log('collection', $collection);

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
	let onPopupUserSelect: string = '';

	let popupSettingsUser: PopupSettings = {
		event: 'focus-click', // event that triggers the popup
		target: 'popupAutocomplete', // should match the data-popup attribute of the popup element
		placement: 'right' // where the popup should appear relative to the input
	};
</script>

<!--  Check User Role collection Permission-->
{#if collection.permissions?.[user.role]?.write != false}
	<!-- Desktop Right Sidebar -->
	{#if $mode == 'view'}
		<button type="button" on:click={() => mode.set('create')} class=" variant-filled-primary btn mt-2">
			<iconify-icon icon="mdi:pen" width="24" />Create
		</button>
	{:else if ['edit', 'create'].includes($mode)}
		<div class="mx-2 mt-2 flex h-screen flex-col justify-between">
			<header class="mx-2 flex flex-col items-center justify-center gap-2">
				<button type="button" on:click={saveData} class="variant-filled-primary btn w-full gap-2">
					<iconify-icon icon="material-symbols:save" width="24" class="text-white" />
					Save {$collection.name}
				</button>

				<!--Clone -->
				<button
					type="button"
					on:click={() => $modifyEntry('Clone')}
					class="gradient-secondary gradient-secondary-hover gradient-secondary-focus btn w-full gap-2"
				>
					<iconify-icon icon="bi:clipboard-data-fill" width="24" />Clone {$collection.name}
				</button>

				{#if $mode == 'edit'}
					<button type="button" on:click={() => $modifyEntry('Delete')} class="variant-filled-error btn">
						<iconify-icon icon="icomoon-free:bin" width="24" />Delete {$collection.name}
					</button>
				{/if}

				<!-- Publish/Unpublish -->
				<Toggles label="Publish" OnIcon="ic:baseline-check-circle" OffIcon="material-symbols:close" />
				<!-- Promote -->
				<label class="flex items-center space-x-2">
					<p>Promote</p>
					<input class="checkbox" type="checkbox" checked />
				</label>
			</header>

			<!-- Publish Options -->
			<main class="mt-4 flex w-full flex-col items-center justify-center gap-2 text-white">
				<p class="mt-2 w-full border-b font-bold uppercase text-primary-500">Publish Options:</p>

				<!--Authored by autocomplete -->
				<div class="mx-2 flex flex-col items-center justify-center overflow-auto">
					<p class="mr-2 text-primary-500">Authored by:</p>
					<div class="relative z-50">
						<!-- add use:popup directive to the element that triggers the popup -->
						<input
							class="autocomplete input"
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
				<p class="mt-2">Schedule | Authored on:</p>
				<input type="datetime-local" bind:value={schedule} class="variant-filled-surface text-sm" />
			</main>

			<footer class="-mx-1 mb-2 flex w-full flex-col items-center justify-center gap-2 text-white">
				<!--Content Info -->
				<h2 class="text-center font-bold uppercase text-primary-500">{$collection.name} Info:</h2>

				<div class="mt-2 grid grid-cols-3 items-center gap-x-2 text-[12px] leading-tight">
					{#each Object.keys(dates) as key}
						<div class="capitalize">{key}:</div>
					{/each}

					{#each Object.values(dates) as value}
						<div class="text-primary-500">{value}</div>
					{/each}
				</div>
			</footer>
		</div>
	{:else if $mode == 'delete'}
		<!-- no permission -->
		<button type="button" on:click={() => $modifyEntry('Delete')} class="variant-filled-success btn">
			<iconify-icon icon="icomoon-free:bin" width="24" />Delete
		</button>
	{/if}
{:else}
	<!-- TODO: find better rule -->
	<button class="variant-ghost-error btn mt-2">No Permission</button>
{/if}
