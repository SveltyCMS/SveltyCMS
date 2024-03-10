<script lang="ts">
	import axios from 'axios';
	import { onDestroy } from 'svelte';
	import { obj2formData } from '@utils/utils';
	import '@collections';
	import { categories, updateCollections } from '@src/collections';

	// Stores
	import { mode, collection, drawerExpanded, unAssigned } from '@stores/store';

	// Components
	import FloatingInput from '@components/system/inputs/floatingInput.svelte';
	import IconifyPicker from '@components/IconifyPicker.svelte';
	import PageTitle from '@components/PageTitle.svelte';
	import WidgetBuilder from './WidgetBuilder.svelte';
	import Collections from './Collections.svelte';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Required default widget fields
	let name = $mode == 'edit' ? $collection.name : '';
	let icon = $mode == 'edit' ? $collection.icon : '';
	let slug = $mode == 'edit' ? $collection.slug : name;
	let status = $mode == 'edit' ? $collection.status : 'unpublish';
	let description = $mode == 'edit' ? $collection.description : '';

	//dropdown list
	let items = ['published', 'unpublished', 'draft', 'schedule'];

	let fields = [];
	let addField = false;
	let navButton;

	$mode = 'create';
	$drawerExpanded = true;

	collection.subscribe(() => {
		name = $mode == 'edit' ? $collection.name : '';
		icon = $mode == 'edit' ? $collection.icon : '';
		slug = $mode == 'edit' ? $collection.slug : name;
		description = $mode == 'edit' ? $collection.description : '';
		status = $mode == 'edit' ? $collection.status : 'unpublish';
	});

	$: if ($mode == 'create') {
		name = '';
		icon = '';
		slug = '';
		description = '';
		status = 'unpublish';
		fields = [];
	}

	onDestroy(async () => {
		await updateCollections();
	});

	// Function to save data by sending a POST request to the /api/builder endpoint
	function save() {
		let _categories: { name: string; icon: string; collections: string[] }[] = [];
		for (let category of $categories) {
			_categories.push({
				name: category.name,
				icon: category.icon,
				collections: category.collections.map((x) => `🗑️collections.${x.name}🗑️` as string)
			});
		}

		axios.post(`?/saveConfig`, obj2formData({ categories: _categories }), {
			headers: {
				'Content-Type': 'multipart/form-data'
			}
		});
		if (!name) return;
		let data =
			$mode == 'edit'
				? obj2formData({ originalName: $collection.name, collectionName: name, fields: $collection.fields, icon })
				: obj2formData({ fields, collectionName: name, icon });
		axios.post(`?/saveCollection`, data, {
			headers: {
				'Content-Type': 'multipart/form-data'
			}
		});
	}
</script>

<!-- Page Title -->
<div class="flex items-center justify-between">
	{#if $mode == 'create' || $mode == 'edit'}
		<PageTitle
			name={$mode == 'create' ? 'Create New ' : `Edit ${name} Category`}
			icon="material-symbols:ink-pen"
			iconColor="text-tertiary-500 dark:text-primary-500"
		/>
		<button class="variant-ghost-secondary btn-icon mr-2 p-2" on:click={() => mode.set('view')}
			><iconify-icon icon="material-symbols:close" width="24" /></button
		>
	{:else if $mode == 'view'}
		<PageTitle name="Collection Builder" icon="material-symbols:ink-pen" iconColor="text-tertiary-500 dark:text-primary-500" />
	{/if}
</div>

<div class="wrapper">
	<div class="flex text-white">
		{#if $mode == 'view'}
			<!--Left Panel -->

			<section class="w-[280px] pl-1 pt-1">
				<!-- Menu Selection -->
				<p class="text-center text-xl text-tertiary-500 dark:text-primary-500">Category</p>
				<Collections modeSet={'edit'} />

				<!-- unAssigned Selection -->
				{#if $unAssigned && $unAssigned.length > 0}
					<div class="mt-5 flex flex-col items-center justify-center rounded border border-warning-500">
						<p class="border-b text-center text-warning-500">{m.builder_Unassigned()}</p>
						<div class="m-1 flex flex-wrap gap-2 text-white">
							{@html $unAssigned.map((x) => `<button class="badge variant-filled-primary" role="button" tabindex="0">${x.name}</button>`).join('')}
						</div>
					</div>
				{/if}
			</section>
		{/if}

		<!--Right Panel -->
		<!-- Display collections -->
		<div class=" flex w-full flex-col items-center">
			<div class="flex justify-between gap-2">
				<!-- <p class="text-center text-tertiary-500 dark:text-primary-500">Click on any existing Category to edit or Create A New</p> -->
				<!-- add new Collection -->
				{#if $mode == 'view'}
					<button
						on:click={() => {
							mode.set('create');
						}}
						class="variant-filled-tertiary btn"
					>
						{m.builder_createnew()}
					</button>
				{/if}

				{#if $mode != 'view'}
					<div class="flex w-screen justify-center px-2">
						<!-- Save Collection -->
						<button on:click={save} class="variant-filled-tertiary btn dark:variant-filled-primary">{m.builder_SaveCollection()}</button>
					</div>
				{/if}
			</div>

			{#if $mode == 'create'}
				<!-- add new collection fields -->
				<div class="mt-3 min-w-[300px] gap-2 rounded p-2">
					<p class="text-center text-xs text-error-500">{m.builder_required()}</p>

					<FloatingInput
						label="Name"
						name="name"
						icon="fluent:text-12-filled"
						inputClass="text-tertiary-500 dark:text-primary-500"
						bind:value={name}
					/>
					<p class="text-center text-xs text-tertiary-500 dark:text-primary-500">{m.builder_optional()}</p>
					<!-- <div class="max-w-[300px]">
					<IconifyPicker bind:iconselected={icon} />
				</div> -->
					<FloatingInput label="Icon" name="icon" icon="tdesign:file-icon" inputClass="text-tertiary-500 dark:text-primary-500" bind:value={icon} />
					<FloatingInput label="Slug" name="slug" icon="formkit:url" inputClass="text-tertiary-500 dark:text-primary-500" bind:value={slug} />
					<FloatingInput
						label="description"
						name="description"
						icon="material-symbols:notes"
						inputClass="text-tertiary-500 dark:text-primary-500"
						bind:value={description}
					/>
					<FloatingInput
						label="Status"
						name="status"
						icon="pajamas:status-health"
						inputClass="text-tertiary-500 dark:text-primary-500"
						bind:value={status}
					/>
					<WidgetBuilder {fields} bind:addField />
				</div>
			{:else if $mode == 'edit'}
				<!-- edit collection fields -->
				<div class="mt-3 space-y-2 p-2">
					<p class="text-center text-xs text-error-500">{m.builder_required()}</p>
					<FloatingInput
						label="name"
						name="name"
						icon="fluent:text-12-filled"
						inputClass="text-tertiary-500 dark:text-primary-500"
						bind:value={name}
					/>
					<p class=" text-center text-xs">Optional</p>

					<!-- <FloatingInput label="icon" name="icon" icon="tdesign:file-icon" inputClass="text-tertiary-500 dark:text-primary-500" bind:value={icon} /> -->
					<IconifyPicker bind:iconselected={icon} searchQuery={icon} />

					<FloatingInput label="slug" name="slug" icon="formkit:url" inputClass="text-tertiary-500 dark:text-primary-500" bind:value={slug} />

					<FloatingInput
						label="description"
						name="description"
						icon="material-symbols:notes"
						inputClass="text-tertiary-500 dark:text-primary-500"
						bind:value={description}
					/>

					<FloatingInput
						label="status"
						name="status"
						icon="pajamas:status-health"
						inputClass="text-tertiary-500 dark:text-primary-500"
						bind:value={status}
					/>
					<!-- <DropDown {items} bind:selected={status} /> -->

					<WidgetBuilder bind:fields={$collection.fields} bind:addField />
				</div>
			{/if}
		</div>
	</div>
</div>
