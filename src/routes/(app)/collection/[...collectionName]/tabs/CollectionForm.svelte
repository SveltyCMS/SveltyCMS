<script lang="ts">
	// Stores
	import { page } from '$app/stores';
	import { mode, collectionValue, collections, tabSet } from '@stores/store';

	// Components
	import IconifyPicker from '@components/IconifyPicker.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { popup } from '@skeletonlabs/skeleton';
	import type { PopupSettings } from '@skeletonlabs/skeleton';
	import type { Schema } from '@src/collections/types';

	import { createEventDispatcher } from 'svelte';
	import { getCollections } from '@src/collections';

	const dispatch = createEventDispatcher();

	// Extract the collection name from the URL
	const collectionName = $page.params.collectionName;
	//check if collection Name exists set mode edit or create
	if ($collections.find((x) => x.name === collectionName)) {
		// fetch the collection from the API
		getCollections().then((data) => {
			mode.set('edit');
			let collection = data.find((x) => x.name === collectionName) as Schema;
			collectionValue.set(collection); // current collection
		});
	} else {
		collectionValue.set({
			...$collectionValue,
			fields: $collectionValue.fields ? $collectionValue.fields : [],
			name: collectionName
		});
	}

	// Popup Tooltips
	let NameTooltip: PopupSettings = {
		event: 'hover',
		target: 'Name',
		placement: 'right'
	};
	let IconTooltip: PopupSettings = {
		event: 'hover',
		target: 'Icon',
		placement: 'right'
	};
	let SlugTooltip: PopupSettings = {
		event: 'hover',
		target: 'Slug',
		placement: 'right'
	};
	let DescriptionTooltip: PopupSettings = {
		event: 'hover',
		target: 'Description',
		placement: 'right'
	};
	let StatusTooltip: PopupSettings = {
		event: 'hover',
		target: 'Status',
		placement: 'right'
	};

	// Form fields
	let DBName = '';
	let searchQuery = '';
	const statuses = ['published', 'unpublished', 'draft', 'schedule', 'cloned'];
	let autoUpdateSlug = true;

	function handleNameInput() {
		if ($collectionValue.name) {
			// Update the URL
			window.history.replaceState({}, '', `/collection/${$collectionValue.name}`);

			// Update the page title
			dispatch('updatePageTitle', `Create <span class="text-primary-500"> ${$collectionValue.name} </span> Collection`);

			// Update the linked slug input
			$collectionValue.slug = $collectionValue.name.toLowerCase().replace(/\s+/g, '_');

			// Call the `onSlugInput` function to update the slug variable
			onSlugInput();
		}
	}

	function onSlugInput() {
		// Update the slug field whenever the name field is changed
		if ($collectionValue.name) {
			collectionValue.set({
				...$collectionValue,
				slug: $collectionValue.name.toLowerCase().replace(/\s+/g, '_')
			});
			return $collectionValue.slug;
		}
		// Disable automatic slug updates
		autoUpdateSlug = false;
	}

	$: {
		if ($collectionValue) {
			// Update DBName  lowercase and replace Spaces
			DBName = $collectionValue.name ? $collectionValue.name.toLowerCase().replace(/ /g, '_') : '';
			// Automatically update slug when name changes
			if (autoUpdateSlug) {
				$collectionValue.slug = $collectionValue.name ? $collectionValue.name.toLowerCase().replace(/ /g, '_') : '';
			}
			if ($mode == 'edit') {
				dispatch('updatePageTitle', `Edit <span class="text-primary-500">${$collectionValue.name} </span> Collection`);
			} else if ($collectionValue.name) {
				dispatch('updatePageTitle', `Create <span class="text-primary-500"> ${$collectionValue.name} </span> Collection`);
			} else {
				dispatch('updatePageTitle', `Create <span class="text-primary-500"> new </span> Collection`);
			}
		}
	}

	function handleNextClick() {
		tabSet.set(1);
	}
</script>

<!-- Required -->
<div class="mb-2 text-center text-xs text-error-500">* {m.collection_required()}</div>

<!-- Collection Name -->
<div class="flex flex-col gap-3 rounded p-2">
	<div class="w-full items-center sm:flex">
		<label for="name" class="flex-grow-1 relative mr-2 flex w-36">
			{m.collection_name()} <span class="mx-1 text-error-500">*</span>
			<iconify-icon icon="material-symbols:info" use:popup={NameTooltip} width="18" class="ml-1 text-tertiary-500 dark:text-primary-500" /></label
		>

		<!-- tooltip -->
		<div class="card variant-filled z-50 max-w-sm" data-popup="Name">
			<!-- Popup Tooltip with the arrow element -->
			<div class="card variant-filled z-50 max-w-sm p-2" data-popup="Name">
				<p>{m.collection_name_tooltip1()}</p>
				<p>{m.collection_name_tooltip2()}</p>
				<div class="variant-filled arrow" />
			</div>

			<div class="w-full">
				<input
					type="text"
					required
					id="name"
					bind:value={$collectionValue.name}
					on:input={handleNameInput}
					placeholder={m.collection_name_placeholder()}
					class="input text-black dark:text-primary-500"
				/>

				{#if $collectionValue && $collectionValue.name}
					<p class="mb-3 sm:mb-0">
						{m.collection_DBname()} <span class="font-bold text-tertiary-500 dark:text-primary-500">{DBName}</span>
					</p>
				{/if}
			</div>
		</div>
	</div>
</div>

<div class="flex flex-col gap-3 rounded-md border p-2">
	<p class="text-token mb-2 text-center font-bold">{m.collectionname_optional()}:</p>

	<!-- iconify icon chooser -->
	<div class="w-full items-center sm:flex">
		<label for="icon" class="flex-grow-1 relative mr-2 flex w-36">
			{m.collectionname_labelicon()}
			<iconify-icon icon="material-symbols:info" use:popup={IconTooltip} width="18" class="ml-1 text-tertiary-500 dark:text-primary-500" />
		</label>

		<!-- Popup Tooltip with the arrow element -->
		<div class="card variant-filled z-50 max-w-sm p-2" data-popup="Icon">
			<p>{m.collection_icon_tooltip()}</p>
			<div class="variant-filled arrow" />
		</div>

		<IconifyPicker bind:searchQuery bind:icon={$collectionValue['icon']} bind:iconselected={$collectionValue['icon']} />
	</div>

	<!-- Slug -->
	<div class="items-center sm:flex">
		<label for="slug" class="flex-grow-1 relative mr-2 flex w-36">
			{m.collection_slug()}
			<iconify-icon icon="material-symbols:info" use:popup={SlugTooltip} width="18" class="ml-1 text-tertiary-500 dark:text-primary-500" />
		</label>

		<!-- Popup Tooltip with the arrow element -->
		<div class="card variant-filled z-50 max-w-sm p-2" data-popup="Slug">
			<p>{m.collection_slug_tooltip()}</p>
			<div class="variant-filled arrow" />
		</div>

		<input
			type="text"
			id="slug"
			bind:value={$collectionValue.slug}
			placeholder={m.collection_slug_input()}
			class="input text-black dark:text-primary-500"
		/>
	</div>

	<!-- Description -->
	<div class="items-center sm:flex">
		<label for="description" class="flex-grow-1 relative mr-2 flex w-36">
			{m.collectionname_description()}
			<iconify-icon icon="material-symbols:info" use:popup={DescriptionTooltip} width="18" class="ml-1 text-tertiary-500 dark:text-primary-500" />
		</label>

		<!-- Popup Tooltip with the arrow element -->
		<div class="card variant-filled z-50 max-w-sm p-2" data-popup="Description">
			<p>{m.collection_description()}</p>
			<div class="variant-filled arrow" />
		</div>

		<textarea
			id="description"
			rows="2"
			cols="50"
			bind:value={$collectionValue.description}
			placeholder={m.collection_description_placeholder()}
			class="input text-black dark:text-primary-500"
		/>
	</div>

	<!-- Status -->
	<div class="items-center sm:flex">
		<label for="status" class="flex-grow-1 relative mr-2 flex w-36">
			{m.collection_status()}
			<iconify-icon icon="material-symbols:info" use:popup={StatusTooltip} width="18" class="ml-1 text-tertiary-500 dark:text-primary-500" />
		</label>

		<!-- Popup Tooltip with the arrow element -->
		<div class="card variant-filled z-50 max-w-sm p-2" data-popup="Status">
			<p>{m.collection_status_tooltip()}</p>
			<div class="variant-filled arrow" />
		</div>

		<select id="status" bind:value={$collectionValue.status} class="input text-black dark:text-primary-500">
			{#each statuses as statusOption}
				<option value={statusOption} class="">{statusOption}</option>
			{/each}
		</select>
	</div>
</div>

<!-- Buttons Cancel & Next-->
<div class="mt-2 flex justify-between">
	<a href="/collection" class="variant-filled-secondary btn mt-2">{m.button_cancel()}</a>
	<button type="button" on:click={handleNextClick} class="variant-filled-tertiary btn mt-2 dark:variant-filled-primary">{m.button_next()}</button>
</div>
