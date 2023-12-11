<script lang="ts">
	import '@src/collections';
	import Collections from './Collections.svelte';
	import { mode, collection, unAssigned } from '@src/stores/store';
	import axios from 'axios';
	import { obj2formData } from '@src/utils/utils';
	import WidgetBuilder from './WidgetBuilder.svelte';
	import FloatingInput from '@src/components/system/inputs/floatingInput.svelte';
	import IconifyPicker from '@src/components/IconifyPicker.svelte';

	import PageTitle from '@src/components/PageTitle.svelte';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';
	import DropDown from '@src/components/system/dropDown/DropDown.svelte';

	// Required default widget fields
	let name = $mode == 'edit' ? $collection.name : '';
	let icon = $mode == 'edit' ? $collection.icon : '';
	let status = $mode == 'edit' ? $collection.status : 'unpublish';
	let slug = $mode == 'edit' ? $collection.slug : name;

	//dropdown list
	let items = ['published', 'unpublished', 'draft', 'schedule'];

	let fields = [];
	let addField = false;

	// Function to save data by sending a POST request to the /api/builder endpoint
	function save() {
		let data =
			$mode == 'edit'
				? obj2formData({
						originalName: $collection.name,
						collectionName: name,
						icon: $collection.icon,
						status: $collection.status,
						slug: $collection.slug,
						fields: $collection.fields
					})
				: obj2formData({ fields, collectionName: name, icon, status, slug });
		axios.post(`?/saveCollection`, data, {
			headers: {
				'Content-Type': 'multipart/form-data'
			}
		});
	}
	collection.subscribe(() => {
		name = $mode == 'edit' ? $collection.name : '';
		icon = $mode == 'edit' ? $collection.icon : '';
		status = $mode == 'edit' ? $collection.status : 'unpublish';
		slug = $mode == 'edit' ? $collection.slug : name;
	});
</script>

<!-- Page Title -->
<div class="flex items-center justify-between">
	{#if $mode == 'create' || $mode == 'edit'}
		<PageTitle name={$mode == 'create' ? 'Create New ' : `Edit ${name} Category`} icon="material-symbols:ink-pen" iconColor="text-primary-500" />
		<button class="variant-ghost-secondary btn-icon mr-2 p-2" on:click={() => mode.set('view')}
			><iconify-icon icon="material-symbols:close" width="24" /></button
		>
	{:else if $mode == 'view'}
		<PageTitle name="Collection Builder" icon="material-symbols:ink-pen" iconColor="text-primary-500" />
	{/if}
</div>
<div class="mt-2 flex text-white">
	{#if $mode == 'view'}
		<!--Left Panel -->
		<section class="w-[280px] pl-1 pt-1">
			<!-- Menu Selection -->
			<p class="text-center text-xl text-primary-500">Category</p>
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
	<div class="mt-8 flex w-full flex-col items-center">
		<div class="flex justify-between gap-2">
			<!-- <p class="text-center text-primary-500">Click on any existing Category to edit or Create A New</p> -->
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
				<div class="flex w-screen max-w-[400px] justify-center px-2">
					<!-- Save Collection -->
					<button on:click={save} class="variant-filled-primary btn">{m.builder_SaveCollection()}</button>
				</div>
			{/if}
		</div>

		{#if $mode == 'create'}
			<!-- add new collection fields -->
			<div class="mt-3 min-w-[300px] gap-2 rounded bg-surface-500 p-2">
				<p class="text-center text-xs text-error-500">{m.builder_required()}</p>

				<FloatingInput label="Name" name="name" icon="fluent:text-12-filled" inputClass="text-primary-500" bind:value={name} />
				<p class="text-center text-xs text-primary-500">{m.builder_optional()}</p>
				<!-- <div class="max-w-[300px]">
					<IconifyPicker bind:iconselected={icon} />
				</div> -->
				<FloatingInput label="Icon" name="icon" icon="tdesign:file-icon" inputClass="text-primary-500" bind:value={icon} />
				<FloatingInput label="Status" name="status" icon="pajamas:status-health" inputClass="text-primary-500" bind:value={status} />
				<FloatingInput label="Slug" name="slug" icon="formkit:url" inputClass="text-primary-500" bind:value={slug} />
				<WidgetBuilder {fields} bind:addField />
			</div>
		{:else if $mode == 'edit'}
			<!-- edit collection fields -->
			<div class="mt-3 space-y-2 bg-surface-500 p-2">
				<p class="text-center text-xs text-error-500">{m.builder_required()}</p>
				<FloatingInput label="name" name="name" icon="fluent:text-12-filled" inputClass="text-primary-500" bind:value={name} />
				<p class=" text-center text-xs">Optional</p>

				<!-- <FloatingInput label="icon" name="icon" icon="tdesign:file-icon" inputClass="text-primary-500" bind:value={icon} /> -->
				<IconifyPicker bind:iconselected={icon} />

				<FloatingInput label="status" name="status" icon="pajamas:status-health" inputClass="text-primary-500" bind:value={status} />
				<!-- <DropDown {items} bind:selected={status} /> -->

				<FloatingInput label="slug" name="slug" icon="formkit:url" inputClass="text-primary-500" bind:value={slug} />

				<WidgetBuilder fields={$collection.fields} bind:addField />
			</div>
		{/if}
	</div>
</div>
