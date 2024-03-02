<script lang="ts">
	// Stores
	import {
		collection,
		categories,
		collectionValue,
		mode,
		modifyEntry,
		contentLanguage,
		saveLayerStore,
		headerActionButton,
		shouldShowNextButton
	} from '@stores/store';
	import { screenWidth, toggleSidebar, sidebarState, handleSidebarToggle } from '@stores/sidebarStore';

	// const userRole = $page.data.user.role;
	const userRole = 'admin';
	//console.log($page.data.user.role);

	//ParaglideJS
	import * as m from '@src/paraglide/messages';
	import { PUBLIC_CONTENT_LANGUAGES } from '$env/static/public';

	import { saveFormData } from '@utils/utils';
	import { get } from 'svelte/store';

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

	function handleReload() {
		mode.set('view');
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
				on:click={() => toggleSidebar('left', get(screenWidth) === 'desktop' ? 'full' : 'collapsed')}
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
						<span class=" uppercase text-tertiary-500 dark:text-primary-500">{$collection?.name}</span>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<div class="flex items-center justify-end gap-1 sm:gap-2 md:gap-4">
		<!-- Check if user role has access to collection -->
		<!-- mobile mode -->
		{#if $screenWidth !== 'desktop'}
			{#if $shouldShowNextButton}
				<!-- Next Button  -->
				<button type="button" on:click={next} class="variant-filled-tertiary btn-icon dark:variant-filled-primary md:btn">
					<iconify-icon icon="carbon:next-filled" width="24" class="text-white" />
					<span class="hidden md:block">{m.widget_megamenu_next()}</span>
				</button>
			{:else}
				<!-- Save Content -->
				<!-- disabled={!$collection?.permissions?.[userRole]?.write} -->
				<button type="button" on:click={saveData} class="variant-filled-tertiary btn-icon dark:variant-filled-primary md:btn">
					<iconify-icon icon="material-symbols:save" width="24" class="text-white" />
					<span class="hidden md:block">Save</span>
				</button>

				<!-- DropDown to show more Buttons -->
				<button type="button" on:keydown on:click={() => (showMore = !showMore)} class="variant-ghost-surface btn-icon">
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
			<!-- desktop -->

			<!-- Select Content Language -->
			<div class="hidden flex-col items-center justify-center md:flex">
				<select class="variant-ghost-surface m-0 rounded text-white" bind:value={$contentLanguage} on:change={handleChange}>
					{#each Object.keys(options) as value}
						<option {value}>{value.toUpperCase()}</option>
					{/each}
				</select>
			</div>
		{/if}

		<!-- TODO: fix button icon switch -->
		<!-- Cancel/Reload -->
		{#if $headerActionButton}
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
			<button type="button" on:click={() => $modifyEntry('delete')} class="gradient-error gradient-error-hover gradient-error-focus btn-icon">
				<iconify-icon icon="icomoon-free:bin" width="24" />
			</button>
		</div>

		<!-- Clone Content -->
		{#if $mode == 'edit'}
			{#if $modifyEntry('unpublish')}
				<div class="flex flex-col items-center justify-center">
					<button
						type="button"
						on:click={() => $modifyEntry('publish')}
						disabled={!($collection?.permissions?.[userRole]?.write && $collection?.permissions?.[userRole]?.create)}
						class="gradient-tertiary gradient-tertiary-hover gradient-tertiary-focus btn-icon"
					>
						<iconify-icon icon="bi:hand-thumbs-up-fill" width="24" />
					</button>
				</div>
			{:else}
				<div class="flex flex-col items-center justify-center">
					<button
						type="button"
						on:click={() => $modifyEntry('unpublish')}
						disabled={!$collection?.permissions?.[userRole]?.write}
						class="gradient-yellow gradient-yellow-hover gradient-yellow-focus btn-icon"
					>
						<iconify-icon icon="bi:pause-circle" width="24" />
					</button>
				</div>
			{/if}

			<div class="flex flex-col items-center justify-center">
				<button
					type="button"
					on:click={() => $modifyEntry('schedule')}
					disabled={!$collection?.permissions?.[userRole]?.write}
					class="gradient-pink gradient-pink-hover gradient-pink-focus btn-icon"
				>
					<iconify-icon icon="bi:clock" width="24" />
				</button>
			</div>

			<div class="flex flex-col items-center justify-center">
				<button
					type="button"
					on:click={() => $modifyEntry('clone')}
					disabled={!($collection?.permissions?.[userRole]?.write && $collection?.permissions?.[userRole]?.create)}
					class="gradient-secondary gradient-secondary-hover gradient-secondary-focus btn-icon"
				>
					<iconify-icon icon="bi:clipboard-data-fill" width="24" />
				</button>
			</div>
		{/if}

		<!-- TODO: Show translation Status -->

		<!-- Select Content Language -->
		<!-- Mobile -->
		<!-- TODO: hide arrow for x mobile -->
		<div class="flex flex-col items-center justify-center">
			<select
				class="variant-ghost-surface m-0 rounded text-white sm:appearance-none md:hidden md:appearance-auto"
				bind:value={$contentLanguage}
				on:change={handleChange}
			>
				{#each Object.keys(options) as value}
					<option {value}>{value.toUpperCase()}</option>
				{/each}
			</select>
		</div>
	</div>
{/if}
