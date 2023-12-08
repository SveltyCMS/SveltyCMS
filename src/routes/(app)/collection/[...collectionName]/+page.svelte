<script lang="ts">
	import PageTitle from '@src/components/PageTitle.svelte';

	// Collection Creation
	import { TabGroup, Tab, getModalStore } from '@skeletonlabs/skeleton';
	import type { ModalSettings, ModalComponent } from '@skeletonlabs/skeleton';
	const modalStore = getModalStore();
	import VerticalList from '@src/components/VerticalList.svelte';
	import IconifyPicker from '@src/components/IconifyPicker.svelte';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	// TS & Json export
	function onCompleteHandler(e: Event): void {
		// Create an object containing the values of the collection builder
		const data = {
			name,
			DBName,
			description,
			helper,
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
	let autoUpdateDBName = true;
	let description = '';
	let helper = '';
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

	//  Widget data
	// export let items: any;
	// console.log('dataItem', items);
	let items = [
		{ id: 1, name: 'First', DBName: 'first', widget: 'Text', icon: 'ic:baseline-text-fields' },
		{ id: 2, name: 'Last', DBName: 'last', widget: 'Text', icon: 'ic:baseline-text-fields' },
		{ id: 3, name: 'Email', DBName: 'email', widget: 'Email', icon: 'ic:baseline-email' },
		{ id: 4, name: 'Image', DBName: 'image', widget: 'ImageUpload', icon: 'ic:baseline-image' }
	];

	const headers = ['ID', 'Icon', 'Name', 'DBName', 'Widget'];

	const flipDurationMs = 300;

	const handleDndConsider = (e) => {
		items = e.detail.items;
	};

	const handleDndFinalize = (e) => {
		items = e.detail.items;
	};
</script>

<div class="align-centre mb-2 mt-2 flex dark:text-white">
	<PageTitle name="Category {name} Builder" icon="ic:baseline-build" />
</div>
<div class="m-2">
	<p class="mb-2 hidden text-center text-primary-500 sm:block">This builder will help you to setup a new Content Collection</p>

	<TabGroup on:complete={onCompleteHandler}>
		<Tab bind:group={tabSet} name="tab1" value={0}>
			<div class="flex items-center gap-1">
				<iconify-icon icon="ic:baseline-edit" width="24" class="text-primary-500" />
				<span class:active={tabSet === 0} class:text-primary-500={tabSet === 0}>Edit</span>
			</div>
		</Tab>
		<Tab bind:group={tabSet} name="tab2" value={1}>
			<div class="flex items-center gap-1">
				<iconify-icon icon="mdi:widgets-outline" width="24" class="text-primary-500" />
				<span class:active={tabSet === 1} class:text-primary-500={tabSet === 1}>Widget Fields</span>
			</div>
		</Tab>

		<!-- Tab Panels --->
		<svelte:fragment slot="panel">
			<!-- Edit -->
			{#if tabSet === 0}
				<div class="mb-2 text-center text-xs text-error-500">* Required</div>

				<!-- Collection Name -->
				<div class="mb-2 items-center gap-1 sm:mb-4 sm:flex">
					<label for="name" class="relative">Name: <span class="text-error-500">*</span> </label>

					<input
						type="text"
						required
						id="name"
						bind:value={name}
						on:input={checkInputName}
						placeholder="Collection Unique Name"
						class="variant-filled-surface {name ? 'sm:w-1/2' : 'w-full'}"
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
				<div class="flex flex-col gap-2 rounded-md border p-2">
					<p class="mb-2 text-center font-bold text-primary-500 sm:text-left">{m.collectionname_optional()}</p>

					<!-- Description -->
					<div class="items-center sm:flex">
						<label for="description" class="relative">{m.collectionname_description()} </label>

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
					<div class="w-full items-center sm:flex">
						<label for="icon" class="relative">
							{m.collectionname_labelicon()}
						</label>
						{#if icon.helper}
							<iconify-icon icon="material-symbols:info" width="18" class="absolute -top-3 right-2" />
						{/if}

						<IconifyPicker {searchQuery} {icon} {iconselected} />
					</div>
					<!-- Status -->
					<div class="items-center sm:flex">
						<label class="relative" for="status"> Status: </label>
						<select id="status" bind:value={status} class="variant-filled-surface w-full">
							{#each statuses as statusOption}
								<option value={statusOption} class="">{statusOption}</option>
							{/each}
						</select>
					</div>

					<!-- Slug -->
					<div class="items-center sm:flex">
						<label for="slug" class="relative"> Slug: </label>
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
					<button type="button" on:click={() => (tabSet = 1)} class="variant-filled-primary btn mt-2">Next</button>
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
					{#each items as { id, icon, name, DBName, widget } (id)}
						<div class="border-blue variant-ghost-secondary my-2 flex w-full items-center gap-6 rounded-md border p-1 text-center text-primary-500">
							<div class="marker: flex-grow-1 variant-outline-primary badge rounded-full text-white">
								{id}
							</div>
							<iconify-icon {icon} width="24" class="flex-grow-1 text-primary-500" />
							<div class="flex-grow-2 text-white">{name}</div>
							<div class="flex-grow-2 text-white">{DBName}</div>
							<div class="flex-grow-2 text-white">{widget}</div>
						</div>
					{/each}
				</VerticalList>

				<div class=" border-surface-400-500-token border-t text-center">
					<button class="variant-filled-tertiary btn mt-2" on:click={modalComponentForm}>Add more Fields</button>
				</div>
				<div class=" flex items-center justify-between">
					<button type="button" on:click={() => (tabSet = 0)} class="variant-filled-secondary btn mt-2 justify-end">Previous</button>
					<button type="button" on:click={onCompleteHandler} class="variant-filled-primary btn mt-2 justify-end dark:text-black">Save</button>
				</div>
			{/if}
		</svelte:fragment>
	</TabGroup>
</div>

<style lang="postcss">
	label {
		min-width: 100px;
	}
</style>
