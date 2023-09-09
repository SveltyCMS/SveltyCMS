<script lang="ts">
	import PageTitle from '@src/components/PageTitle.svelte';

	// Collection Creation
	import { TabGroup, Tab, Modal, getModalStore } from '@skeletonlabs/skeleton';
	import type { ModalSettings, ModalComponent } from '@skeletonlabs/skeleton';
	const modalStore = getModalStore();
	import VerticalList from '@src/components/VerticalList.svelte';
	import IconifyPicker from '@src/components/IconifyPicker.svelte';

	// typesafe-i18n
	import LL from '@src/i18n/i18n-svelte';
	import { toggleLeftSidebar, systemLanguage } from '@src/stores/store';

	// TS & Json export
	function onCompleteHandler(e: Event): void {
		// Create an object containing the values of the collection builder
		const data = {
			name,
			DBName,
			icon,
			iconselected,
			slug
		};

		// Generate TypeScript code from the data object
		let tsCode = `import widgets from '../components/widgets';\n\n`;
		tsCode += `let schema = ${JSON.stringify(data, null, 2)};\n`;
		tsCode += `export default schema;\n`;

		// Create a Blob object from the TypeScript code
		const tsBlob = new Blob([tsCode], { type: 'text/typescript' });

		// Create a URL for the TypeScript Blob object
		const tsUrl = URL.createObjectURL(tsBlob);

		// Create a link element for downloading the TypeScript file
		const tsLink = document.createElement('a');
		tsLink.href = tsUrl;

		// Use the name entered by the user as the filename for the generated TypeScript file
		tsLink.download = `${name}.ts`;

		// Append the link element to the document body and click it to trigger the download
		document.body.appendChild(tsLink);
		tsLink.click();

		// Remove the link element from the document body
		document.body.removeChild(tsLink);

		// Generate JSON code from the data object
		const jsonCode = JSON.stringify(data, null, 2);

		// Create a Blob object from the JSON code
		const jsonBlob = new Blob([jsonCode], { type: 'application/json' });

		// Create a URL for the JSON Blob object
		const jsonUrl = URL.createObjectURL(jsonBlob);

		// Create a link element for downloading the JSON file
		const jsonLink = document.createElement('a');
		jsonLink.href = jsonUrl;

		// Use the name entered by the user as the filename for the generated JSON file
		jsonLink.download = `${name}.json`;

		// Append the link element to the document body and click it to trigger the download
		document.body.appendChild(jsonLink);
		jsonLink.click();

		// Remove the link element from the document body
		document.body.removeChild(jsonLink);
	}

	let lockedName: boolean = true;

	function checkInputName() {
		if (name) {
			lockedName = false;
		} else {
			lockedName = true;
		}
	}

	let tabSet: number = 0;

	let name = '';
	let DBName = '';
	let description = '';
	let searchQuery = '';
	let icon: any = '';
	let iconselected: any = '';
	let status = 'unpublished';
	const statuses = ['published', 'unpublished', 'draft', 'schedule', 'cloned'];
	let slug = '';
	let autoUpdateSlug = true;

	$: {
		// Update DBName  lowercase and replace Spaces
		DBName = name.toLowerCase().replace(/ /g, '_');

		// Automatically update slug when name changes
		if (autoUpdateSlug) {
			slug = name.toLowerCase().replace(/\s+/g, '_');
		}
	}

	// Stop automatically updating slug when user manually edits it
	function onSlugInput() {
		autoUpdateSlug = false;
	}

	//modal to display widget options
	import MyCustomComponent from './ModalWidgetForm.svelte';

	function modalComponentForm(): void {
		const c: ModalComponent = { ref: MyCustomComponent };
		const modal: ModalSettings = {
			type: 'component',
			component: c,
			title: 'Widget Creation',
			body: 'Complete the form below to create your widget and then press submit.',
			response: (r: any) => console.log('response:', r)
		};
		modalStore.trigger(modal);
	}

	// TODO: Widget data
	let items = [
		{ id: 1, name: 'Item 1', DBName: 'item1', widget: 'Text' },
		{ id: 2, name: 'Item 2', DBName: 'item2', widget: 'Text2' },
		{ id: 3, name: 'Item 3', DBName: 'item3', widget: 'Text3' }
	];

	const headers = ['ID', 'Name', 'DBName', 'Widget'];
	const flipDurationMs = 300;

	const handleDndConsider = (e) => {
		items = e.detail.items;
	};

	const handleDndFinalize = (e) => {
		items = e.detail.items;
	};
</script>

<div class="align-centre mb-2 mt-2 flex dark:text-white">
	<!-- TODO: fix TypeScript, as Icon is already optional? -->
	<PageTitle name="Collection Builder" icon="dashicons:welcome-widgets-menus" />
</div>
<div class="m-2">
	<p class="mb-2 hidden text-center sm:block">
		This builder will help you to setup a new Content Collection
	</p>

	<TabGroup on:complete={onCompleteHandler}>
		<Tab bind:group={tabSet} name="tab1" value={0}>
			<div class="flex items-center gap-1">
				<iconify-icon icon="ic:baseline-edit" width="24" class="text-primary-500" />
				Edit
			</div></Tab
		>
		<Tab bind:group={tabSet} name="tab2" value={1}
			><div class="flex items-center gap-1">
				<iconify-icon icon="mdi:widgets-outline" width="24" class="text-primary-500" />
				Fields
			</div></Tab
		>
		<Tab bind:group={tabSet} name="tab3" value={2}
			><div class="flex items-center gap-1">
				<iconify-icon icon="ic:twotone-shield" width="24" class="text-primary-500" />
				Permisions
			</div></Tab
		>

		<!-- Tab Panels --->
		<svelte:fragment slot="panel">
			<!-- Edit -->
			{#if tabSet === 0}
				<div class="mb-2 text-center text-xs text-error-500">* Required</div>

				<!-- Collection Name -->
				<div class="mb-2 flex items-center gap-4 sm:mb-4 sm:ml-1.5">
					<label for="name" class="relative"
						>Name: <span class="text-error-500">*</span>
						<iconify-icon icon="material-symbols:info" width="18" class="absolute -top-3 right-2" />
					</label>

					<input
						type="text"
						required
						id="name"
						bind:value={name}
						on:input={checkInputName}
						placeholder="Collection Unique Name"
						class="variant-filled-surface ml-1.5 {name ? 'sm:w-1/2' : 'w-full'}"
					/>

					{#if name}
						<p class="mb-3 hidden sm:block">
							Database Name: <span class="font-bold text-primary-500">{DBName}</span>
						</p>
					{/if}
				</div>
				{#if name}
					<p class="mb-3 sm:hidden">
						Database Name: <span class="font-bold text-primary-500">{DBName}</span>
					</p>
				{/if}
				<div class="rounded-md border p-2">
					<p class="mb-2 font-bold text-primary-500">Optional values:</p>

					<!-- Collection Description -->
					<div class="mb-3 flex items-center gap-4">
						<label for="description" class="relative">Description: </label>

						<textarea
							id="description"
							rows="2"
							cols="50"
							bind:value={description}
							placeholder="Describe your Collection"
							class="variant-filled-surface w-full"
						/>
					</div>

					<!-- TODO: Pass icon icon selected values -->
					<!-- iconify icon chooser -->
					<div class="w-full">
						<IconifyPicker {searchQuery} {icon} {iconselected} />
					</div>
					<!-- status -->
					<div class="mb-4 flex items-center gap-4">
						<label class="relative" for="status">
							Status:
							<iconify-icon
								icon="material-symbols:info"
								width="18"
								class="absolute -top-3 right-1"
							/>
						</label>
						<select id="status" bind:value={status} class="variant-filled-surface w-full">
							{#each statuses as statusOption}
								<option value={statusOption} class="">{statusOption}</option>
							{/each}
						</select>
					</div>

					<!-- slug -->
					<div class="mb-4 flex items-center gap-4">
						<label for="slug" class="relative">
							Slug:
							<iconify-icon
								icon="material-symbols:info"
								width="18"
								class="absolute -top-3 right-1"
							/>
						</label>
						<input
							type="text"
							id="slug"
							bind:value={slug}
							placeholder="Path for collection..."
							class="variant-filled-surface w-full"
							on:input={onSlugInput}
						/>
					</div>
				</div>

				<div class="flex justify-between">
					<a href="/collection" class="variant-filled-secondary btn mt-2">Cancel</a>
					<button
						type="button"
						on:click={() => (tabSet = 1)}
						class="variant-filled-primary btn mt-2">Next</button
					>
				</div>

				<!-- Manage Fields -->
			{:else if tabSet === 1}
				<h2 class="mb-2 flex items-center">
					<p>Field field for :</p>
					<iconify-icon icon={iconselected} width="24" class="mx-1 text-primary-500" />
					<div class="text-primary-500">{name}</div>
				</h2>
				<div class="variant-outline-primary rounded-t-md p-2 text-center">
					<p>Select as many widget inputs as you require to create your Collection</p>
					<p class="mb-2">Drag & Drop your widgets fields to sort them</p>
				</div>

				<!--dnd vertical row -->
				<VerticalList {items} {headers} {flipDurationMs} {handleDndConsider} {handleDndFinalize}>
					{#each items as item (item.id)}
						<div
							class="border-blue variant-ghost-secondary my-2 flex w-full items-center gap-6 rounded-md border p-1 text-center text-primary-500"
						>
							<div class="marker: variant-outline-primary badge rounded-full text-white">
								{item.id}
							</div>
							<div class="text-white">{item.name}</div>
							<div class="text-white">{item.DBName}</div>
							<div class="text-white">{item.widget}</div>
						</div>
					{/each}
				</VerticalList>

				<div class=" border-surface-400-500-token border-t text-center">
					<button class="variant-filled-tertiary btn mt-2" on:click={modalComponentForm}
						>Add more Fields</button
					>
				</div>
				<div class=" flex items-center justify-between">
					<button
						type="button"
						on:click={() => (tabSet = 0)}
						class="variant-filled-secondary btn mt-2 justify-end">Previous</button
					>
					<button
						type="button"
						on:click={onCompleteHandler}
						class="variant-filled-primary btn mt-2 justify-end dark:text-black">Save</button
					>
				</div>

				<!-- Manage Permissions -->
			{:else if tabSet === 2}
				only if required (tab panel 3 contents)
			{/if}
		</svelte:fragment>
	</TabGroup>
</div>

<style lang="postcss">
	label {
		min-width: 100px;
	}
</style>
