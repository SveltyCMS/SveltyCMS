<script lang="ts">
	import Fields from '@src/components/Fields.svelte';
	import { mode } from '@src/stores/store';
	import { saveFormData } from '@src/utils/utils';
	import type { FieldType } from '.';

	// sveltekit
	import { FileDropzone } from '@skeletonlabs/skeleton';

	export let field: FieldType;

	let _fieldsValue: any = [];
	let files: any = [];
	let name: any;

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
			// if no files currently being chosen, means we are editing, should update.
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

<!-- TODO: Add Image display and link File--><!-- <FileDropzone /> -->
<FileDropzone {name} accept="image/*" multiple on:change={onDropzoneChangeHandler}>
	<svelte:fragment slot="lead"
		><iconify-icon icon="fa6-solid:file-arrow-up" width="45" /></svelte:fragment
	>
	<svelte:fragment slot="message"
		><span class="font-bold">Upload <span class="text-primary-500">Multiple </span>files</span> or drag
		& drop</svelte:fragment
	>
	<svelte:fragment slot="meta">PNG, JPG, GIF, WEBP, AVIF, and SVG allowed.</svelte:fragment>
</FileDropzone>

{#if files.length > 0}
	{#each files as file, index}
		<div class="relative my-4 rounded-lg border-2 border-[#8cccff] p-[20px]">
			<Fields root={false} fields={field.fields} bind:fieldsData={_fieldsValue[index]} {file} />
		</div>
	{/each}
{:else if $mode == 'edit'}
	<Fields fields={field.fields} />
{:else}
	<!-- <input
		bind:files
		name={field.db_fieldName}
		multiple
		type="file"
		class="input block w-full cursor-pointer rounded-lg border border-surface-300 bg-surface-50 text-sm text-surface-900 focus:outline-none dark:border-surface-600 dark:bg-surface-700 dark:text-surface-400 dark:placeholder-surface-400"
	/> -->
{/if}
