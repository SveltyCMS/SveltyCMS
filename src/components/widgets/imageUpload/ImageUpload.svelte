<script lang="ts">
	import axios from 'axios';

	import { FileDropzone } from '@skeletonlabs/skeleton';

	export let field = { db_fieldName: '', path: '' };
	//value is File when used inside imageArray, is dbObject when shown from entrylist.
	export let value: any = {};
	export let widgetValue: FileList;

	$: console.log(widgetValue);

	function setFile(node: HTMLInputElement) {
		node.onchange = (e) => (widgetValue = (e.target as HTMLInputElement).files as FileList);
		if (!value) return;

		if (value.type) {
			let fileList = new DataTransfer();
			fileList.items.add(value);
			widgetValue = node.files = fileList.files;
		} else {
			axios
				.get(`${field.path}/${value.originalname}`, { responseType: 'blob' })
				.then(({ data }) => {
					let fileList = new DataTransfer();
					let file = new File([data], value.originalname, {
						type: value.mimetype
					});
					fileList.items.add(file);
					widgetValue = node.files = fileList.files;
				});
		}
	}
</script>

<input
	use:setFile
	hidden={!!widgetValue}
	name={field.db_fieldName}
	class="w-full cursor-pointer rounded-lg border border-surface-300 bg-surface-50 text-sm text-surface-900 focus:outline-none dark:border-surface-600 dark:bg-surface-700 dark:text-surface-400 dark:placeholder-surface-400"
	type="file"
/>
<!-- TODO: Add DropZone for better User experiance-->
<FileDropzone />

{#if widgetValue}
	<img src={URL.createObjectURL(widgetValue[0])} alt="" />
{/if}

<style>
	img {
		max-width: 600px;
		max-height: 200px;
		margin: auto;
		margin-top: 10px;
	}
</style>
