<script lang="ts">
	import type { ImageArray_Field } from './types';
	import Fields from '$src/components/Fields.svelte';
	import { saveSimpleData, shape_fields } from '$src/lib/utils/utils_svelte';
	import { entryData } from '$src/stores/store';

	// Skeleton
	import { FileDropzone } from '@skeletonlabs/skeleton';

	export let field: ImageArray_Field;
	export let collection: any;
	// export let value: any;

	let _fieldsValue: any = [];
	let fields: any;
	let files: any = [];
	$: console.log(_fieldsValue);
	let getData = async () => {
		for (let i = 0; i < files.length; i++) {
			let fieldsData = _fieldsValue[i];
			await saveSimpleData(collection, fieldsData);
		}
		if (!files.length) {
			// if no files currently being chosen, means we are editing, should update.
			let fieldsData = _fieldsValue;
			await saveSimpleData(collection, fieldsData);
		}
	};

	shape_fields(field.fields).then((data) => (fields = data));
</script>

{#if files.length > 0}
	{#each files as file, index}
		<div class="relative my-4 rounded-lg border-2 border-[#8cccff] p-[20px]">
			<Fields
				{getData}
				{collection}
				root={false}
				{fields}
				bind:fieldsValue={_fieldsValue[index]}
				value={{ [field.imageUploadTitle]: file }}
			/>
		</div>
	{/each}
{:else if $entryData}
	<Fields {getData} {collection} {fields} bind:fieldsValue={_fieldsValue} value={$entryData} />
{:else}
	<input
		bind:files
		name={field.db_fieldName}
		multiple
		class="block w-full cursor-pointer rounded-lg border border-surface-300 bg-surface-50 text-sm text-surface-900 focus:outline-none dark:border-surface-600 dark:bg-surface-700 dark:text-surface-400 dark:placeholder-surface-400"
		type="file"
	/>

	<FileDropzone bind:files />
{/if}

<style>
</style>
