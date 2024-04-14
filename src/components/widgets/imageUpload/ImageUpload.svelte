<script lang="ts">
	import axios from 'axios';
	import type { FieldType } from '.';
	import { asAny, convertTimestampToDateString, getFieldName } from '@src/utils/utils';

	// Stores
	import { entryData, mode, loadingProgress } from '@stores/store';

	// Skeleton
	import { FileDropzone, ProgressBar } from '@skeletonlabs/skeleton';

	let _data: File | undefined;
	let updated = false;
	let input: HTMLInputElement;

	let isFlipped = false; // State variable to track flip button
	let isEditor = false; // State variable to track flip button

	export let field: FieldType;
	export const WidgetData = async () => {
		if (_data) {
			_data.path = field.path;
		}

		console.log(_data);
		return updated ? _data : null;
	};
	export let value: File | { [key: string]: any } = $entryData[getFieldName(field)]; // pass file directly from imageArray

	const fieldName = getFieldName(field);

	function setFile(node: HTMLInputElement) {
		node.onchange = (e) => {
			if ((e.target as HTMLInputElement).files?.length == 0) return;
			updated = true;
			_data = (e.target as HTMLInputElement).files?.[0] as File;
		};

		if (value instanceof File) {
			let fileList = new DataTransfer();
			fileList.items.add(value);
			node.files = fileList.files;
			_data = node.files[0];
			updated = true;
		} else if ($mode === 'edit' && value?.thumbnail) {
			axios.get(value.thumbnail.url, { responseType: 'blob' }).then(({ data }) => {
				if (value instanceof File) return;
				let fileList = new DataTransfer();
				let file = new File([data], value.thumbnail.name, {
					type: value.mimetype
				});
				fileList.items.add(file);
				node.files = fileList.files;
				_data = node.files[0];
			});
		}
	}
</script>

<input use:setFile bind:this={input} accept="image/*,image/webp,image/avif,image/svg+xml" name={fieldName} type="file" hidden />

{#if _data}
	<div class="flex w-full max-w-full flex-col border-2 border-dashed border-surface-600 bg-surface-200 dark:border-surface-500 dark:bg-surface-700">
		<div class="mx-2 flex items-center justify-between gap-2">
			<p class="text-left">Name: <span class="text-tertiary-500 dark:text-primary-500">{_data.name}</span></p>

			<p class="text-left">
				Size: <span class="text-tertiary-500 dark:text-primary-500">{(_data.size / 1024).toFixed(2)} KB</span>
			</p>
		</div>
		<div class="mx-2 flex items-center justify-around gap-2 pb-2">
			{#if _data && !isFlipped}
				<img src={URL.createObjectURL(_data)} alt="" />
			{:else}
				<div class="grid grid-cols-2 gap-1 text-left text-xs">
					<p class="">Type:</p>
					<p class="font-bold text-tertiary-500 dark:text-primary-500">{_data.type}</p>
					<p class="">Path:</p>
					<p class="font-bold text-tertiary-500 dark:text-primary-500">{_data.path}</p>
					<p class="">Uploaded:</p>
					<p class="font-bold text-tertiary-500 dark:text-primary-500">{convertTimestampToDateString(_data.lastModified)}</p>
					<p class="">Last Modified:</p>
					<p class="font-bold text-tertiary-500 dark:text-primary-500">{convertTimestampToDateString(_data.lastModified)}</p>
				</div>
			{/if}

			<div class="flex flex-col items-center justify-between gap-2">
				<!-- Flip -->
				<button on:click={() => (isFlipped = !isFlipped)} class="variant-ghost btn-icon">
					<iconify-icon icon="uiw:reload" width="24" class={isFlipped ? ' text-yellow-500 delay-100' : 'text-white'} />
				</button>
				<!-- Edit -->
				<button on:click={() => (isEditor = !isEditor)} class="variant-ghost btn-icon">
					<iconify-icon icon="material-symbols:edit" width="24" class="text-tertiary-500 dark:text-primary-500" />
				</button>
				<!-- Delete -->
				<button on:click={() => (_data = undefined)} class="variant-ghost btn-icon">
					<iconify-icon icon="material-symbols:delete-outline" width="30" class="text-error-500" />
				</button>
			</div>
		</div>
	</div>
{:else}
	<div
		on:drop|preventDefault={(e) => {
			updated = true;
			_data = e?.dataTransfer?.files[0];
		}}
		on:dragover|preventDefault={(e) => {
			asAny(e.target).style.borderColor = '#6bdfff';
		}}
		on:dragleave|preventDefault={(e) => {
			asAny(e.target).style.removeProperty('border-color');
		}}
		class="mt-2 flex h-[200px] w-full max-w-full select-none flex-col items-center justify-center gap-4 rounded border-2 border-dashed border-surface-600 bg-surface-200 dark:border-surface-500 dark:bg-surface-700"
		role="cell"
		tabindex="0"
	>
		<div class="grid grid-cols-6 items-center p-4">
			{#if !_data}<iconify-icon icon="fa6-solid:file-arrow-up" width="40" />{/if}

			<div class="col-span-5">
				{#if !_data}
					<p class="font-bold"><span class="text-tertiary-500 dark:text-primary-500">Upload Image</span> or Drag & Drop</p>
				{:else}
					<p class="font-bold"><span class="text-tertiary-500 dark:text-primary-500">ReplaceImage</span> or Drag & Drop</p>
				{/if}
				<p class="text-sm opacity-75">PNG, JPG, GIF, WEBP, AVIF, and SVG allowed.</p>

				<button on:click={() => input.click()} class="variant-filled-tertiary btn mt-3 dark:variant-filled-primary">Browse</button>
			</div>
		</div>
	</div>
{/if}

<!-- 	const optimizedFileName: string | undefined = undefined;
	let optimizedMimeType: string | undefined = undefined;
	let hashValue: string | undefined; // Explicitly define the type

	async function setFile(event: Event) {
		const node = event.target as HTMLInputElement;

		// Reset loading progress
		loadingProgress.set(0);

		if (node.files?.length === 0) {
			//console.log('setFile:', 'No files selected');
			return;
		}

		// Handle file selection
		const handleFileSelection = async (files: FileList) => {
			// console.log('handleFileSelection:', 'Function called');

			updated = true;
			_data = (event.target as HTMLInputElement).files?.[0] as File;

			// All files processed, set loading progress to 100%
			loadingProgress.set(100);
		};

		// Check if the input has files selected
		if (node.files) {
			handleFileSelection(node.files);
		} else if (value instanceof File) {
			const fileList = new DataTransfer();
			fileList.items.add(value);
			node.files = fileList.files;
			_data = node.files[0];
			updated = true;

			//TODO: Image Preview not working for edit anymore
		}

		// All files processed, set loading progress to 100%
		loadingProgress.set(100);
	}

	// Gets Thumbnail data
	async function fetchImage() {
		if (!entryData || !fieldName) {
			console.error('Error fetching Image: entryData or fieldName is not defined');
			return;
		}

		const thumbnail = $entryData[fieldName]?.thumbnail; // Ensure thumbnail exists
		if (!thumbnail || !thumbnail.url) {
			console.error('Error fetching Image: Thumbnail or URL is not defined');
			return; // Exit if there's no thumbnail or URL
		}

		try {
			const { data, headers } = await axios.get(thumbnail.url, { responseType: 'blob' });
			const fileList = new DataTransfer();
			const file = new File([data], thumbnail.name, {
				type: headers['content-type'] || thumbnail.mimetype || 'application/octet-stream'
			});
			fileList.items.add(file);
			_data = fileList.files[0];
			updated = true;

			// Set optimizedMimeType to the fetched image's MIME type
			optimizedMimeType = file.type;
		} catch (error) {
			console.error('Error fetching Image:', error);
			// Handle error appropriately
		}
	}

	onMount(() => {
		if ($mode === 'edit' && $entryData[fieldName]) {
			// console.log('mode edit:', $mode);
			// console.log('entryData:', $entryData[fieldName]);
			fetchImage();
		}
	});
	
	<FileDropzone bind:files={_data} name={fieldName} accept="image/*,image/webp,image/avif,image/svg+xml" on:change={setFile} slotMeta="opacity-100">
	<svelte:fragment slot="lead"
		>{#if !_data}<iconify-icon icon="fa6-solid:file-arrow-up" width="45" />{/if}</svelte:fragment
	>
	<svelte:fragment slot="message">
		{#if !_data}
			<span class="font-bold text-tertiary-500 dark:text-primary-500">Upload a Image</span> or drag & drop
		{:else}
			<span class="font-bold text-tertiary-500 dark:text-primary-500">Replace Image</span> or drag & drop
		{/if}
	</svelte:fragment>
	<svelte:fragment slot="meta">
		{#if !_data}
			<p class="mt-1 text-sm opacity-75">PNG, JPG, GIF, WEBP, AVIF, and SVG allowed.</p>
		{:else}
			<div class="flex flex-col items-center !opacity-100 md:flex-row">
				<div class="flex justify-center md:mr-4">
					<img src={URL.createObjectURL(_data[0])} alt="" class="mt-4 h-60 rounded-md border" />
				</div>
				<div class="mt-2 text-center md:text-left">
					<p class="text-lg font-semibold text-tertiary-500 dark:text-primary-500">Uploaded File:</p>
					<p>Uploaded File: <span class="text-tertiary-500 dark:text-primary-500">{_data[0].name}</span></p>
					<p>
						File size: <span class="text-tertiary-500 dark:text-primary-500">{(_data[0].size / 1024).toFixed(2)} KB</span>
					</p>
					<p>MIME type: <span class="text-tertiary-500 dark:text-primary-500">{_data[0].type}</span></p>

					<br />

					{#if $loadingProgress != 100}
						<ProgressBar label="Image Optimization" value={$loadingProgress} max={100} meter="bg-surface-900-50-token" />

						<p class="text-lg font-semibold text-tertiary-500 dark:text-primary-500">
							{#if optimizedFileName}Uploaded File: <span class="dark:text-primary-5000 text-tertiary-500">{optimizedFileName}</span>{/if}
							{#if $loadingProgress != 100}Optimized as <span class="uppercase">{publicEnv.MEDIA_OUTPUT_FORMAT}: </span>{/if}
						</p>

						<p>File size: <span class="text-tertiary-500 dark:text-primary-500">{(_data[0].size / 1024).toFixed(2)} KB</span></p>
						<p>MIME type: <span class="text-tertiary-500 dark:text-primary-500">{optimizedMimeType || _data[0].type}</span></p>
						<p>Hash: <span class="text-tertiary-500 dark:text-primary-500">{hashValue}</span></p>
					{:else if optimizedFileName}
						<p>File Name: <span class="text-primary-500">{optimizedFileName}</span></p>
						<p>File size: <span class="text-tertiary-500 dark:text-primary-500">{(_data[0].size / 1024).toFixed(2)} KB</span></p>
						<p>MIME type: <span class="text-tertiary-500 dark:text-primary-500">{optimizedMimeType}</span></p>
						<p>Hash: <span class="text-error-500">{hashValue}</span></p>
					{/if}
				</div>
			</div>
		{/if}
	</svelte:fragment>
</FileDropzone> -->

<style lang="postcss">
	img {
		max-width: 500px;
		max-height: 200px;
		margin: auto;
		margin-top: 10px;
		border-radius: 3px;
	}
</style>
