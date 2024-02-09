<script lang="ts">
	import axios from 'axios';
	import type { FieldType } from '.';

	// Stores
	import { entryData, mode, loadingProgress } from '@stores/store';

	import { getFieldName } from '@utils/utils';

	// Skeleton
	import { FileDropzone } from '@skeletonlabs/skeleton';

	let _data: FileList;
	let updated = false;

	export let field: FieldType;
	export const WidgetData = async () => (updated ? _data : null);
	export const file: File | undefined = undefined; // pass file directly from imageArray

	let fieldName = getFieldName(field);
	let optimizedFileName: string | undefined = undefined;
	let optimizedFileSize: number | undefined = undefined;
	let optimizedMimeType: string | undefined = undefined;
	let hashValue: string | undefined; // Explicitly define the type

	let thumbnail: string = '';

	async function setFile(event: Event) {
		const node = event.target as HTMLInputElement;

		// Reset loading progress
		loadingProgress.set(0);

		if (!node.files || node.files.length === 0) {
			//console.log('setFile:', 'No files selected');
			return;
		}

		const file = node.files[0];
		const fileExt = file.name.slice(file.name.lastIndexOf('.'));

		if (fileExt === '.docx') {
			thumbnail = 'vscode-icons:file-type-word';
		} else if (fileExt === '.xlsx') {
			thumbnail = 'vscode-icons:file-type-excel';
		} else if (fileExt === '.pptx') {
			thumbnail = 'vscode-icons:file-type-powerpoint';
		} else if (fileExt === '.pdf') {
			thumbnail = 'vscode-icons:file-type-pdf2';
		}

		// Display the selected thumbnail
		//console.log('Thumbnail:', thumbnail);

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

			//TODO: File Preview not working for edit anymore
		} else if ($mode === 'edit') {
			axios.get($entryData[fieldName].thumbnail.url, { responseType: 'blob' }).then(({ data }) => {
				const fileList = new DataTransfer();

				// Return file list
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

<FileDropzone
	bind:files={_data}
	name={fieldName}
	accept=".pdf, .txt, application/pdf, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-powerpoint, application/vnd.openxmlformats-officedocument.presentationml.presentation"
	multiple
	on:change={setFile}
	slotMeta="opacity-100"
>
	<svelte:fragment slot="lead"
		>{#if !_data}<iconify-icon icon="fa6-solid:file-arrow-up" width="45" />{/if}</svelte:fragment
	>
	<svelte:fragment slot="message">
		{#if !_data}<span class="font-bold text-primary-500">Upload a file</span> or drag & drop
		{:else}<span class="font-bold text-primary-500">Replace {_data[0].name}</span> or drag & drop
		{/if}
	</svelte:fragment>
	<svelte:fragment slot="meta">
		{#if !_data}
			<p class="mt-1 text-sm opacity-75">TXT, PDF, and office formats allowed.</p>
		{/if}

		<!-- File info-->
		{#if _data}
			<div class="flex flex-col items-center !opacity-100 md:flex-row">
				<div class="flex justify-center md:mr-4">
					<!-- Display file icon instead of an image -->
					{#if thumbnail}
						<iconify-icon icon={thumbnail} width="45" />
					{:else}
						<iconify-icon icon="fa6-solid:file-arrow-up" width="45" />
					{/if}
				</div>

				<div class="mt-2 text-center md:text-left">
					<p class="text-lg font-semibold text-primary-500">Uploaded File:</p>
					<p>Uploaded File: <span class="text-primary-500">{_data[0].name}</span></p>
					<p>
						File size: <span class="text-primary-500">{(_data[0].size / 1024).toFixed(2)} KB</span>
					</p>
					<p>MIME type: <span class="text-primary-500">{_data[0].type}</span></p>
				</div>
			</div>
		{/if}
	</svelte:fragment>
</FileDropzone>
