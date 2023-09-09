<script lang="ts">
	import { PUBLIC_CONTENT_LANGUAGES } from '$env/static/public';
	import { collection, categories } from '@src/stores/store';
	import { saveFormData, cloneData, deleteData } from '@src/utils/utils';
	import { page } from '$app/stores';
	import type { User } from '@src/collections/Auth';

	let user: User = $page.data.user;

	import {
		collectionValue,
		deleteEntry,
		mode,
		screenWidth,
		toggleLeftSidebar,
		handleSidebarToggle,
		contentLanguage
	} from '@src/stores/store';

	// typesafe-i18n
	import LL from '@src/i18n/i18n-svelte';

	// Manually parse the object from JSON string
	let options = JSON.parse(PUBLIC_CONTENT_LANGUAGES.replace(/'/g, '"'));

	function handleChange(event: any) {
		const selectedLanguage = event.target.value.toLowerCase();
		contentLanguage.set(selectedLanguage);
		// console.log('selectedLanguage', selectedLanguage);
	}

	// function to Save Data
	async function saveData() {
		await saveFormData({ data: $collectionValue });
		mode.set('view' || 'edit');
		handleSidebarToggle();
	}

	// function to undo the changes made by handleButtonClick
	function handleCancel() {
		mode.set('view');
		handleSidebarToggle();
	}

	export let showMore = false;
	$: if ($mode === 'edit' || $mode === 'create') {
		showMore = false;
	}
</script>

<header
	class="relative flex w-full items-center justify-between {showMore
		? ''
		: 'border-b'} border-secondary-600-300-token bg-white p-2 dark:bg-surface-700"
>
	<div class="flex items-center justify-start">
		<!-- hamburger -->
		{#if $toggleLeftSidebar === 'closed'}
			<button
				type="button"
				on:click={() => toggleLeftSidebar.click()}
				class="variant-ghost-surface btn-icon"
			>
				<iconify-icon icon="mingcute:menu-fill" width="24" />
			</button>
		{/if}

		<!-- Collection type with icon -->
		<div class="flex {!$toggleLeftSidebar ? 'ml-2' : 'ml-1'}">
			{#if collection && collection.icon}
				<div class="flex items-center justify-center">
					<iconify-icon icon={collection.icon} width="24" class="text-error-500" />
				</div>
			{/if}

			{#if categories && categories[0]}
				<div class="ml-2 flex flex-col text-left text-gray-400 dark:text-gray-300">
					<div class="text-sm font-bold uppercase text-primary-500">{$mode}:</div>
					<div class="text-xs capitalize">
						{categories[0].name}
						<span class=" uppercase text-primary-500">{$collection.name}</span>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<div class="flex items-center justify-end gap-1 sm:gap-2 md:gap-4">
		<!-- Check if user role has access to collection -->

		{#if collection.permissions?.[user.role]?.write != false}
			{#if $screenWidth !== 'desktop'}
				<!-- Save Content -->
				<button type="button" on:click={saveData} class="variant-filled-primary btn-icon md:btn">
					<iconify-icon icon="material-symbols:save" width="24" class="text-white" />
					<span class="hidden md:block">Save</span>
				</button>

				<!-- DropDown to show more Buttons -->
				<button
					type="button"
					on:keydown
					on:click={() => (showMore = !showMore)}
					class="variant-ghost-surface btn-icon"
				>
					<iconify-icon icon="material-symbols:filter-list-rounded" width="30" />
				</button>

				<!-- Desktop -->
				<select
					class="variant-ghost-surface hidden rounded border-surface-500 text-white md:block"
					bind:value={$contentLanguage}
					on:change={handleChange}
				>
					{#each Object.entries(options) as [value, label]}
						<option {value}>{label}</option>
					{/each}
				</select>
			{/if}
		{:else}
			<!-- TODO: Show Restriction -->
			<button class="variant-ghost-error btn break-words">No Permission</button>
		{/if}

		<!-- Cancel -->
		<button type="button" on:click={handleCancel} class="variant-ghost-surface btn-icon">
			<iconify-icon icon="material-symbols:close" width="24" />
		</button>
	</div>
</header>
{#if showMore && $collection.permissions?.[user?.role]?.write != false}
	<div class="-mx-2 flex items-center justify-center gap-10 pt-2">
		<div class="flex flex-col items-center justify-center">
			<!-- Delete Content -->
			<button type="button" on:click={$deleteEntry} class="variant-filled-error btn-icon">
				<iconify-icon icon="icomoon-free:bin" width="24" />
			</button>
			<div class="-mt-1 text-center text-[9px] uppercase text-black dark:text-white">Delete</div>
		</div>

		<!-- Clone Content -->
		{#if $mode == 'edit'}
			<div class="flex flex-col items-center justify-center">
				<button type="button" on:click={cloneData} class="variant-filled-secondary btn-icon">
					<iconify-icon icon="fa-solid:clone" width="24" />
				</button>
				<div class="-mt-1 text-center text-[9px] uppercase text-black dark:text-white">Clone</div>
			</div>
		{/if}

		<!-- TODO: Show translation Status -->

		<!-- Select Content Language -->
		<!-- Mobile -->
		<!-- TODO: hide arrow for x mobile -->
		<div class="flex flex-col items-center justify-center">
			<select
				class="md:appearance-auto variant-ghost-surface m-0 rounded text-white sm:appearance-none md:hidden"
				bind:value={$contentLanguage}
				on:change={handleChange}
			>
				{#each Object.keys(options) as value}
					<option {value}>{value.toUpperCase()}</option>
				{/each}
			</select>
			<div class="-mt-1 text-center text-[9px] uppercase text-black dark:text-white">Language</div>
		</div>
	</div>
{/if}
