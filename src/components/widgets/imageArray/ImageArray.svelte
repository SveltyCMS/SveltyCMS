<script lang="ts">
	import Fields from '@src/components/Fields.svelte';
	import { loadingProgress, mode } from '@src/stores/store';
	import { saveFormData } from '@src/utils/utils';
	import type { FieldType } from '.';

	// sveltekit
	import { FileDropzone, ProgressBar } from '@skeletonlabs/skeleton';
	import { PUBLIC_MEDIA_OUTPUT_FORMAT } from '$env/static/public';
	import { ImportsNotUsedAsValues } from 'typescript';

	export let field: FieldType;

	let _fieldsValue: any = [];
	let files: any = [];
	let name: any;
	let optimizedFileName: string | undefined = undefined;
	let optimizedFileSize: number | undefined = undefined;
	let optimizedMimeType: string | undefined = undefined;
	let hashValue: string | undefined; // Explicitly define the type

	if (field.db_fieldName) {
		name = field.db_fieldName;
	} else {
		name = 'defaultName';
	}

	export const WidgetData = async () => {
		//console.log('files:', files);
		for (let i = 0; i < files.length; i++) {
			let fieldsData = _fieldsValue[i];

			//console.log('fieldsData:', fieldsData);
			debugger;
			await saveFormData(fieldsData);
		}
		if (!files.length) {
			// If no files are currently being chosen, which means we are editing, we should update.
			let fieldsData = _fieldsValue;
			await saveFormData({ data: fieldsData });
		}
	};

	let selectedFiles: string[] = []; // Array to store selected file names

	function onDropzoneChangeHandler(e: Event): void {
		const input = e.target as HTMLInputElement;
		const newFiles = Array.from(input.files || []); // Handle null FileList
		selectedFiles = newFiles.map((file) => file.name); // Store only file names
		files = newFiles;
	}
</script>

{#if files.length > 0}
	{#each files as file, index}
		<div class="relative my-4 rounded-lg border-2 border-surface-300 p-[20px]">
			{#if $loadingProgress != 100}
				<ProgressBar label="Image Optimization" value={$loadingProgress} max={100} meter="bg-surface-900-50-token" />
				<div class="flex justify-center md:mr-4">
					<img src={URL.createObjectURL(file)} alt="" class="mt-4 h-60 rounded-md border" />
				</div>
				<p class="text-lg font-semibold text-primary-500">
					{#if optimizedFileName}Uploaded File: <span class="text-primary-500">{optimizedFileName}</span>{/if}
					{#if $loadingProgress != 100}Optimized as <span class="uppercase">{PUBLIC_MEDIA_OUTPUT_FORMAT}: </span>{/if}
				</p>

				<p>File size: <span class="text-primary-500">{(file.size / 1024).toFixed(2)} KB</span></p>
				<p>MIME type: <span class="text-primary-500">{optimizedMimeType || file.type}</span></p>
				<p>Hash: <span class="text-primary-500">{hashValue}</span></p>
			{:else if optimizedFileName}
				<p>File Name: <span class="text-primary-500">{optimizedFileName}</span></p>
				<p>File size: <span class="text-primary-500">{(file.size / 1024).toFixed(2)} KB</span></p>
				<p>MIME type: <span class="text-primary-500">{optimizedMimeType}</span></p>
				<p>Hash: <span class="text-primary-500">{hashValue}</span></p>
			{/if}
			<!-- TODO: Use normal Input no FileDropzone -->
			<Fields root={false} fields={field.fields} bind:fieldsData={_fieldsValue[index]} {file} />
		</div>
	{/each}
{:else if $mode == 'edit'}
	<Fields fields={field.fields} />
{:else}
	<!-- initial file upload Dropzone -->
	<FileDropzone {name} bind:files accept="image/*" type="file" multiple on:change={onDropzoneChangeHandler}>
		<svelte:fragment slot="lead"><iconify-icon icon="fa6-solid:file-arrow-up" width="45" /></svelte:fragment>
		<svelte:fragment slot="message"
			><span class="font-bold">Upload <span class="text-primary-500">Multiple </span>files</span> or drag & drop</svelte:fragment
		>
		<svelte:fragment slot="meta">PNG, JPG, GIF, WEBP, AVIF, and SVG allowed.</svelte:fragment>
	</FileDropzone>
{/if}
