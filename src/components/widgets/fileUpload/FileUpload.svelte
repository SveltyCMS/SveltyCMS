<script lang="ts">
	import axios from 'axios';
	import type { FieldType } from '.';

	// Stores
	import { entryData, mode, loadingProgress } from '@stores/store';

	import { asAny, getFieldName } from '@utils/utils';

	// Components
	import Media from '@src/components/MediaGallery.svelte';

	let _data: File | undefined;
	let updated = false;
	let input: HTMLInputElement;

	export let field: FieldType;
	export const WidgetData = async () => {
		if (_data && _data instanceof File) {
			_data.path = field.path;
		}

		return updated ? _data : null;
	};

	export let value: File = $entryData[getFieldName(field)]; // pass file directly from imageArray

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
		}
	}
</script>

<input use:setFile bind:this={input} accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.ppt,.pptx" name={fieldName} type="file" hidden />

{#if _data}
	<div class="mx-2 flex items-center justify-between gap-2">
		<p class="text-left">Name: <span class="text-tertiary-500 dark:text-primary-500">{_data.name}</span></p>
		<p class="text-left">
			Size: <span class="text-tertiary-500 dark:text-primary-500">{(_data.Size / 1024).toFixed(2)} KB</span>
		</p>

		<!-- Delete -->
		<button on:click={() => (_data = undefined)} class="variant-ghost btn-icon">
			<iconify-icon icon="material-symbols:delete-outline" width="30" class="text-error-500" />
		</button>
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
			{#if !_data}<iconify-icon icon="icon-park-outline:upload-logs" width="50" />{/if}

			<div class="col-span-5">
				{#if !_data}
					<p class="font-bold"><span class="text-tertiary-500 dark:text-primary-500">File Upload </span> or Drag & Drop</p>
				{:else}
					<p class="font-bold"><span class="text-tertiary-500 dark:text-primary-500">Replace File</span> or Drag & Drop</p>
				{/if}
				<p class="text-sm opacity-75">TXT, PDF, and office formats allowed.</p>

				<button on:click={() => input.click()} class="variant-filled-tertiary btn mt-3 dark:variant-filled-primary">Browse</button>
			</div>
		</div>
	</div>
{/if}
