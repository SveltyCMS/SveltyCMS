<script lang="ts">
	import axios from 'axios';
	import type { FieldType } from './';
	import { entryData, mode, loadingProgress } from '@src/stores/store';
	import { getFieldName } from '@src/utils/utils';
	import { FileDropzone, ProgressBar } from '@skeletonlabs/skeleton';
	import { PUBLIC_MEDIA_OUTPUT_FORMAT } from '$env/static/public';

	let _data: FileList;
	let updated = false;

	export let field: FieldType;
	export const WidgetData = async () => (updated ? _data : null);
	export let file: File | undefined = undefined; // pass file directly from imageArray
	//console.log('file', file);

	let fieldName = getFieldName(field);
	let optimizedFileName: string | undefined = undefined;
	let optimizedFileSize: number | undefined = undefined;
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
			console.log('handleFileSelection:', 'Function called');

			updated = true;
			_data = files;

			// All files processed, set loading progress to 100%
			loadingProgress.set(100);
		};

		// Check if the input has files selected
		if (node.files) {
			handleFileSelection(node.files);
		} else if (file instanceof File) {
			const fileList = new DataTransfer();
			fileList.items.add(file);
			_data = fileList.files;
			updated = true;

			//TODO: Image Preview not working for edit anymore
		} else if ($mode === 'edit') {
			console.log('mode edit:', $mode);
			console.log('entryData:', $entryData[fieldName]);
			axios.get($entryData[fieldName].thumbnail.url, { responseType: 'blob' }).then(({ data }) => {
				const fileList = new DataTransfer();
				console.log('fileList:', fileList);
				// Return Thumbnail Image
				const file = new File([data], $entryData[fieldName].thumbnail.name, {
					type: $entryData[fieldName].mimetype
				});
				fileList.items.add(file);
				_data = fileList.files;
				updated = true;
				node.dispatchEvent(new Event('change')); // manually dispatch change event
			});
		}

		// All files processed, set loading progress to 100%
		loadingProgress.set(100);
	}
</script>

<FileDropzone bind:files={_data} name={fieldName} accept="image/*,image/webp,image/avif,image/svg+xml" on:change={setFile} slotMeta="opacity-100">
	<svelte:fragment slot="lead"
		>{#if !_data}<iconify-icon icon="fa6-solid:file-arrow-up" width="45" />{/if}</svelte:fragment
	>
	<svelte:fragment slot="message">
		{#if !_data}<span class="font-bold text-primary-500">Upload a Image</span> or drag & drop
		{:else}<span class="font-bold text-primary-500">Replace {_data[0].name}</span> or drag & drop
		{/if}
	</svelte:fragment>
	<svelte:fragment slot="meta">
		{#if !_data}<p class="mt-1 text-sm opacity-75">PNG, JPG, GIF, WEBP, AVIF, and SVG allowed.</p>
			<!-- Image preview and file info-->
		{:else}
			<div class="flex flex-col items-center !opacity-100 md:flex-row">
				<div class="flex justify-center md:mr-4">
					<img src={URL.createObjectURL(_data[0])} alt="" class="mt-4 h-60 rounded-md border" />
				</div>
				<div class="mt-2 text-center md:text-left">
					<p class="text-lg font-semibold text-primary-500">Uploaded File:</p>
					<p>Uploaded File: <span class="text-primary-500">{_data[0].name}</span></p>
					<p>
						File size: <span class="text-primary-500">{(_data[0].size / 1024).toFixed(2)} KB</span>
					</p>
					<p>MIME type: <span class="text-primary-500">{_data[0].type}</span></p>

					<br />

					<!-- Display loading progress -->
					{#if $loadingProgress != 100}
						<ProgressBar label="Image Optimization" value={$loadingProgress} max={100} meter="bg-surface-900-50-token" />

						<!-- Display optimized image information -->
						<p class="text-lg font-semibold text-primary-500">
							Optimized as <span class="uppercase">{PUBLIC_MEDIA_OUTPUT_FORMAT}: </span>
						</p>
						<!-- Display optimized status once the WebP/AVIF file is generated -->
						<p>Uploaded File: <span class="text-primary-500">{optimizedFileName}</span></p>
						<p>
							File size: <span class="text-error-500">{(_data[0].size / 1024).toFixed(2)} KB</span>
						</p>

						<p>MIME type: <span class="text-error-500">{optimizedMimeType}</span></p>
						<p>Hash: <span class="text-error-500">{hashValue}</span></p>
					{:else if optimizedFileName}
						<!-- display optimized on mode edit -->

						<!-- Display optimized status once the WebP/AVIF file is generated -->
						<p>File Name: <span class="text-primary-500">{optimizedFileName}</span></p>
						<p>
							File size: <span class="text-error-500">{(_data[0].size / 1024).toFixed(2)} KB</span>
						</p>

						<p>MIME type: <span class="text-error-500">{optimizedMimeType}</span></p>
						<p>Hash: <span class="text-error-500">{hashValue}</span></p>
					{/if}
				</div>
			</div>
		{/if}
	</svelte:fragment>
</FileDropzone>
