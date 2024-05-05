<script lang="ts">
	import { publicEnv } from '@root/config/public';
	import { saveFormData, getFieldName } from '@src/utils/utils';
	import type { FieldType } from '.';

	// Stores
	import { loadingProgress, mode } from '@stores/store';

	// Components
	import Fields from '@components/Fields.svelte';
	import VerticalList from '@src/components/VerticalList.svelte';

	// Sveltekit
	import { FileDropzone, ProgressBar, Avatar } from '@skeletonlabs/skeleton';

	export let field: FieldType;

	let files: any = [];
	const _fieldsValue: any = [];
	let name: any;
	const optimizedFileName: string | undefined = undefined;
	//let optimizedFileSize: number | undefined = undefined;
	const optimizedMimeType: string | undefined = undefined;
	let hashValue: string | undefined; // Explicitly define the type
	let selectedFiles: string[] = []; // Array to store selected file names
	let collapsedAll = false;

	if (field.db_fieldName) {
		name = getFieldName(field);
	} else {
		name = 'defaultName';
	}

	export const WidgetData = async () => {
		//console.log('files:', files);
		for (let i = 0; i < files.length; i++) {
			const fieldsData = _fieldsValue[i];

			for (let key in fieldsData) {
				console.log(await fieldsData[key]());
			}

			// Generate UUID for each file
			fieldsData.id = crypto.randomUUID();

			//console.log('fieldsData:', fieldsData);
			await saveFormData(fieldsData);
		}
		if (!files.length) {
			// If no files are currently being chosen, which means we are editing, we should update.
			const fieldsData = _fieldsValue;
			await saveFormData({ data: fieldsData });
		}
	};
	// update added files
	function onDropzoneChangeHandler(e: Event): void {
		const input = e.target as HTMLInputElement;
		const newFiles = Array.from(input.files || []); // Handle null FileList
		selectedFiles = newFiles.map((file) => file.name); // Store only file names
		files = newFiles;
	}

	const items = [
		{ id: 1, collectionName: 'First', DBName: 'first', widget: 'Text', icon: 'ic:baseline-text-fields' },
		{ id: 2, collectionName: 'Last', DBName: 'last', widget: 'Text', icon: 'ic:baseline-text-fields' },
		{ id: 3, collectionName: 'Email', DBName: 'email', widget: 'Email', icon: 'ic:baseline-email' },
		{ id: 4, collectionName: 'Image', DBName: 'image', widget: 'ImageUpload', icon: 'ic:baseline-image' }
	];

	const flipDurationMs = 200;
	const handleDndConsider = (e) => {
		// Get the updated items from the event
		const updatedItems = e.detail.items;

		// Update the `files` array with the new order
		files = updatedItems.map((item) => item.data);
	};

	const handleDndFinalize = (e) => {
		// Get the updated items from the event
		const updatedItems = e.detail.items;

		// Update the `files` array with the new order
		files = updatedItems.map((item) => item.data);
	};

	// Function to toggle collapse all images
	function toggleCollapseAll() {
		// Keep track of the current state of collapsedAll
		collapsedAll = !collapsedAll;

		if (Array.isArray(files)) {
			files.forEach((file) => {
				// If collapsedAll is true, expand all images
				if (collapsedAll) {
					file.collapsed = false;
				}
				// If collapsedAll is false, toggle the collapse state for each file
				else {
					file.collapsed = !file.collapsed;
				}
			});
		}
	}

	// Function to toggle collapse for specific image
	function toggleCollapse(index: number) {
		files[index].collapsed = !files[index].collapsed;
	}

	// Function to delete image
	function deleteImage(index: number) {
		// console.log('deleteImage:', index);

		// Convert files to an array if it is not already one
		if (!Array.isArray(files)) {
			files = Array.from(files);
		}

		// Check if index is valid
		if (index >= 0 && index < files.length) {
			files.splice(index, 1);

			// Update collapsedAll based on whether there are any images left or if all images are collapsed
			if (files.length === 0 || files.every((file) => file.collapsed)) {
				collapsedAll = false;
			}
		} else {
			console.error('Invalid index');
		}
	}

	// Function to more image
	function addMoreImages() {
		console.log('addMoreImages:');
	}
</script>

{#if files.length > 0}
	<div class="flex items-center justify-center gap-2">
		<div class="flex justify-start gap-2">
			<p class="text-primary-500">Drag & Drop to Sort</p>
		</div>
		<div class="flex justify-center gap-2">
			<p class="variant-filled-primary badge rounded-full">{files.length}</p>
			<p>Images</p>
		</div>
		<div class="flex justify-end gap-2">
			<button class="variant-outline-primary btn-icon" on:click={toggleCollapseAll}>
				<iconify-icon icon="mdi:collapse-all-outline" width="20" />
			</button>
			<button class="variant-outline-primary btn-icon" on:click={addMoreImages}>
				<iconify-icon icon="material-symbols:add" width="20" />
			</button>
		</div>
	</div>

	<VerticalList {items} {flipDurationMs} {handleDndConsider} {handleDndFinalize}>
		{#each files as file, index}
			<div class="relative my-2 rounded border-2 border-surface-300 p-2">
				{#if $loadingProgress != 100}
					<div class="flex w-full items-center justify-between {file.collapsed || collapsedAll ? '' : 'border-b pb-2'}">
						<!-- Right Name -->
						<div class="flex items-center gap-2">
							<p class="variant-ghost-primary badge rounded-full">{index}.</p>
							{#if collapsedAll || file.collapsed}
								<Avatar src={URL.createObjectURL(file)} width="w-10" rounded="rounded" />
							{/if}
							<p class="flex-auto font-bold text-primary-500">{file.name}</p>
						</div>

						<!-- Left Icons -->
						<div class="flex items-center gap-2">
							<button class="variant-outline btn-icon" on:click={() => toggleCollapse(index)}>
								<iconify-icon icon="bxs:up-arrow" width="18" class:rotate-180={file.collapsed || collapsedAll} />
							</button>

							<button class="variant-outline btn-icon" on:click={() => deleteImage(index)}>
								<iconify-icon icon="mdi:delete" width="18" class="text-error-500" />
							</button>

							<iconify-icon icon="mdi:drag" width="18" class="ml-2 cursor-move" />
						</div>
					</div>
					{#if $loadingProgress}
						<ProgressBar label="Image Optimization" value={$loadingProgress} max={100} meter="bg-surface-900-50-token" />
					{/if}

					{#if !file.collapsed && !collapsedAll}
						<div class="flex justify-around gap-2 md:mr-4">
							<img src={URL.createObjectURL(file)} alt="" class="mt-4 h-60 rounded-md border" />

							<div>
								<!-- Optimized as  -->
								<p class="text-lg font-semibold text-primary-500">
									{#if optimizedFileName}Uploaded File: <span class="text-primary-500">{optimizedFileName}</span>{/if}
									{#if $loadingProgress != 100}Optimized as <span class="uppercase">{publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.format}: </span>{/if}
								</p>
								<!-- Image data  -->
								<p>File size: <span class="text-primary-500">{(file.size / 1024).toFixed(2)} KB</span></p>
								<p>MIME type: <span class="text-primary-500">{optimizedMimeType || file.type}</span></p>
								<p>Hash: <span class="text-primary-500">{hashValue}</span></p>
							</div>
						</div>
					{/if}
				{:else if optimizedFileName}
					<p>File Name: <span class="text-primary-500">{optimizedFileName}</span></p>
					<p>File size: <span class="text-primary-500">{(file.size / 1024).toFixed(2)} KB</span></p>
					<p>MIME type: <span class="text-primary-500">{optimizedMimeType}</span></p>
					<p>Hash: <span class="text-primary-500">{hashValue}</span></p>
				{/if}

				{#if !file.collapsed && !collapsedAll}
					<!-- TODO: Use normal Input no FileDropzone -->
					<Fields root={false} fields={field.fields} bind:fieldsData={_fieldsValue[index]} value={file} />
				{/if}
			</div>
		{/each}
	</VerticalList>
{:else if $mode == 'edit'}
	<ol class="list">
		<li>
			<span class="text-primary-500">{files.length}.</span>
			<span class="flex-auto"> test <Fields fields={field.fields} /></span>
		</li>
	</ol>
{:else}
	<!-- initial file upload Dropzone -->
	<FileDropzone {name} bind:files accept="image/*" type="file" multiple on:change={onDropzoneChangeHandler}>
		<svelte:fragment slot="lead"><iconify-icon icon="fa6-solid:file-arrow-up" width="45"></iconify-icon></svelte:fragment>
		<svelte:fragment slot="message"
			><span class="font-bold">Upload <span class="text-primary-500">Multiple </span>files</span> or drag & drop</svelte:fragment
		>
		<svelte:fragment slot="meta">PNG, JPG, GIF, WEBP, AVIF, and SVG allowed.</svelte:fragment>
	</FileDropzone>
{/if}
