<script lang="ts">
	import { page } from '$app/stores';
	import { mode, currentCollection, collections, permissionStore, tabSet } from '@stores/store';
	import * as m from '@src/paraglide/messages';
	import IconifyPicker from '@components/IconifyPicker.svelte';
	import { popup } from '@skeletonlabs/skeleton';
	import type { PopupSettings } from '@skeletonlabs/skeleton';
	import type { Schema } from '@src/collections/types';

	import { createEventDispatcher } from 'svelte';
	const dispatch = createEventDispatcher();

	let targetCollection: Schema;

	// Extract the collection name from the URL
	const collectionName = $page.params.collectionName;
	//check if collection Name exists set mode edit or create
	if ($collections.find((x) => x.name === collectionName)) {
		mode.set('edit');
		currentCollection.set($collections.find((x) => x.name === collectionName) as Schema); // current collection
	} else {
		mode.set('create');
		targetCollection = {} as Schema;
		targetCollection.name = collectionName;
		currentCollection.set(targetCollection);
		permissionStore.set({});
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
	// Skeleton

	// Default widget data (tab1)
	let name = $mode == 'edit' ? $currentCollection.name : collectionName;
	let icon = $mode == 'edit' ? $currentCollection.icon : '';
	let slug = $mode == 'edit' ? $currentCollection.slug : name?.toLowerCase().replace(/\s+/g, '_');
	let description = $mode == 'edit' ? $currentCollection.description : '';
	let status = $mode == 'edit' ? $currentCollection.status : 'unpublished';

	// Form fields
	let DBName = '';
	let searchQuery = '';
	let iconselected: any = icon || '';
	const statuses = ['published', 'unpublished', 'draft', 'schedule', 'cloned'];
	let autoUpdateSlug = true;

	function handleNameInput() {
		if (name) {
			// Update the URL
			window.history.replaceState({}, '', `/collection/${name}`);

			// Update the page title
			dispatch('updatePageTitle', `Create <span class="text-primary-500"> ${name} </span> Collection`);

			// Update the linked slug input
			slug = name.toLowerCase().replace(/\s+/g, '_');

			// Call the `onSlugInput` function to update the slug variable
			onSlugInput();
		}
	}

	function onSlugInput() {
		// Update the slug field whenever the name field is changed
		if (name) {
			slug = name.toLowerCase().replace(/\s+/g, '_');
			return slug;
		}
		// Disable automatic slug updates
		autoUpdateSlug = false;
	}

	$: {
		// Update DBName  lowercase and replace Spaces
		DBName = name ? name.toLowerCase().replace(/ /g, '_') : '';

		// Automatically update slug when name changes
		if (autoUpdateSlug) {
			slug = collectionName.toLowerCase().replace(/\s+/g, '_');
		}
		if ($mode == 'edit') {
			dispatch('updatePageTitle', `Edit <span class="text-primary-500">${collectionName} </span> Collection`);
		} else if (collectionName) {
			dispatch('updatePageTitle', `Create <span class="text-primary-500"> ${collectionName} </span> Collection`);
		} else {
			dispatch('updatePageTitle', `Create <span class="text-primary-500"> new </span> Collection`);
		}
	}
</script>

<div class="mb-2 text-center text-xs text-error-500">* {m.collection_required()}</div>

<!-- Collection Name -->
<div class="mb-2 flex flex-col items-start justify-center gap-2">
	<label for="name" class="flex-grow-1 relative mr-2 flex w-fit">
		{m.collection_name()} <span class="mx-1 text-error-500">*</span>
		<iconify-icon icon="material-symbols:info" use:popup={NameTooltip} width="18" class="ml-1 text-tertiary-500 dark:text-primary-500" /></label
	>

	<!-- tooltip -->
	<div class="card variant-filled-secondary z-50 max-w-sm p-4" data-popup="Name">
		<p>{m.collection_name_tooltip1()}</p>
		<p>{m.collection_name_tooltip2()}</p>
		<div class="variant-filled-secondary arrow" />
	</div>

	<input
		type="text"
		required
		id="name"
		bind:value={name}
		on:input={handleNameInput}
		placeholder={m.collection_name_placeholder()}
		class="input {name ? 'w-full md:w-1/2' : 'w-full'}"
	/>

	{#if name}
		<p class="mb-3 sm:mb-0">
			{m.collection_DBname()} <span class="font-bold text-tertiary-500 dark:text-primary-500">{DBName}</span>
		</p>
	{/if}
</div>

<div class="flex flex-col gap-2 rounded-md border p-2">
	<p class="mb-2 text-center font-bold text-tertiary-500 dark:text-primary-500">{m.collectionname_optional()}:</p>

	<!-- TODO: Pass icon icon selected values -->
	<!-- iconify icon chooser -->
	<div class="w-full items-center sm:flex">
		<label for="icon" class="flex-grow-1 relative mr-2 flex w-fit">
			{m.collectionname_labelicon()}
			<iconify-icon icon="material-symbols:info" use:popup={IconTooltip} width="18" class="ml-1 text-tertiary-500 dark:text-primary-500" />
		</label>

		<!-- tooltip -->
		<div class="card variant-filled-secondary z-50 max-w-sm p-4" data-popup="Icon">
			<p>{m.collection_icon_tooltip()}</p>
			<div class="variant-filled-secondary arrow" />
		</div>

		<IconifyPicker bind:searchQuery bind:icon bind:iconselected />
	</div>

	<!-- Slug -->
	<div class="items-center sm:flex">
		<label for="slug" class="flex-grow-1 relative mr-2 flex w-fit">
			{m.collection_slug()}
			<iconify-icon icon="material-symbols:info" use:popup={SlugTooltip} width="18" class="ml-1 text-tertiary-500 dark:text-primary-500" />
		</label>

		<!-- tooltip -->
		<div class="card variant-filled-secondary z-50 max-w-sm p-4" data-popup="Slug">
			<p>{m.collection_slug_tooltip()}</p>
			<div class="variant-filled-secondary arrow" />
		</div>

		<input type="text" id="slug" bind:value={slug} placeholder={m.collection_slug_input()} class="input w-full" on:input={onSlugInput} />
	</div>

	<!-- Description -->
	<div class="items-center sm:flex">
		<label for="description" class="flex-grow-1 relative mr-2 flex w-fit">
			{m.collectionname_description()}
			<iconify-icon icon="material-symbols:info" use:popup={DescriptionTooltip} width="18" class="ml-1 text-tertiary-500 dark:text-primary-500" />
		</label>

		<!-- tooltip -->
		<div class="card variant-filled-secondary z-50 max-w-sm p-4" data-popup="Description">
			<p>{m.collection_description()}</p>
			<div class="variant-filled-secondary arrow" />
		</div>

		<textarea
			id="description"
			rows="2"
			cols="50"
			bind:value={description}
			placeholder={m.collection_description_placeholder()}
			class="input w-full"
		/>
	</div>

	<!-- Status -->
	<div class="items-center sm:flex">
		<label for="status" class="flex-grow-1 relative mr-2 flex w-fit">
			{m.collection_status()}
			<iconify-icon icon="material-symbols:info" use:popup={StatusTooltip} width="18" class="ml-1 text-tertiary-500 dark:text-primary-500" />
		</label>

		<!-- tooltip -->
		<div class="card variant-filled-secondary z-50 max-w-sm p-4" data-popup="Status">
			<p>{m.collection_status_tooltip()}</p>
			<div class="variant-filled-secondary arrow" />
		</div>

		<select id="status" bind:value={status} class="input w-full">
			{#each statuses as statusOption}
				<option value={statusOption} class="">{statusOption}</option>
			{/each}
		</select>
	</div>
</div>

<!-- Buttons -->
<div class="flex justify-between">
	<a href="/collection" class="variant-filled-secondary btn mt-2">{m.collection_cancel()}</a>
	<button type="button" on:click={() => ($tabSet = 1)} class="variant-filled-tertiary btn mt-2 dark:variant-filled-primary"
		>{m.collection_next()}</button
	>
</div>
