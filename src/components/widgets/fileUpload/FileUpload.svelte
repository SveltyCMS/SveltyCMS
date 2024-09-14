<!-- 
@file src/components/widgets/fileUpload/FileUpload.svelte
@description - FileUpload widget
-->

<script lang="ts">
	import axios from 'axios';
	import type { FieldType } from '.';
	import type { MediaFiles } from '@src/utils/types';

	// Stores
	import { entryData, mode, loadingProgress, validationStore } from '@stores/store';
	import { asAny, getFieldName } from '@utils/utils';

	// Components
	import Media from '@src/components/Media.svelte';

	let _data: File | MediaFiles | undefined;
	let updated = false;
	let input: HTMLInputElement;

	export let field: FieldType;

	function returnWidgetData() {
		if (_data && _data instanceof File) {
			_data.path = field.path;
		}

		return updated ? _data : null;
	}
	export const WidgetData = returnWidgetData();

	export let value: File = $entryData[getFieldName(field)];

	const fieldName = getFieldName(field);

	let validationError: string | null = null;

	// Define the validation schema for this widget
	import * as z from 'zod';

	const widgetSchema = z.object({
		file: z
			.instanceof(File)
			.refine((file) => file.size <= 10 * 1024 * 1024, 'File size must be less than 10MB')
			.refine(
				(file) =>
					[
						'application/pdf',
						'application/msword',
						'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
						'application/vnd.ms-excel',
						'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
						'text/plain',
						'application/vnd.ms-powerpoint',
						'application/vnd.openxmlformats-officedocument.presentationml.presentation'
					].includes(file.type),
				'Invalid file format'
			)
	});

	// Generic validation function that uses the provided schema to validate the input
	function validateSchema(schema: z.ZodSchema, data: any): string | null {
		try {
			schema.parse(data);
			validationStore.clearError(fieldName);
			return null; // No error
		} catch (error) {
			if (error instanceof z.ZodError) {
				const errorMessage = error.errors[0]?.message || 'Invalid input';
				validationStore.setError(fieldName, errorMessage);
				return errorMessage;
			}
			return 'Invalid input';
		}
	}

	// Validate the input using the generic validateSchema function
	function validateInput() {
		if (_data instanceof File) {
			validationError = validateSchema(widgetSchema, { file: _data });
		}
	}

	function setFile(node: HTMLInputElement) {
		node.onchange = (e) => {
			if ((e.target as HTMLInputElement).files?.length == 0) return;
			updated = true;
			_data = (e.target as HTMLInputElement).files?.[0] as File;
			validateInput();
		};

		if (value instanceof File) {
			const fileList = new DataTransfer();
			fileList.items.add(value);
			node.files = fileList.files;
			_data = node.files[0];
			updated = true;
			validateInput();
		}
	}

	// Select Media Image
	const mediaOnSelect = (data: MediaFiles) => {
		updated = true;
		showMedia = false;
		_data = data;
		validateInput();
	};
</script>

<input
	use:setFile
	bind:this={input}
	accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.ppt,.pptx"
	name={fieldName}
	type="file"
	hidden
	aria-invalid={!!validationError}
	aria-describedby={validationError ? `${fieldName}-error` : undefined}
/>

{#if _data}
	<div class="mx-2 flex items-center justify-between gap-2">
		<p class="text-left">Name: <span class="text-tertiary-500 dark:text-primary-500">{_data.name}</span></p>
		<p class="text-left">Size: <span class="text-tertiary-500 dark:text-primary-500">{(_data.size / 1024).toFixed(2)} KB</span></p>

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
			validateInput();
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

<!-- Error Message -->
{#if validationError}
	<p id={`${fieldName}-error`} class="text-center text-sm text-error-500">
		{validationError}
	</p>
{/if}
