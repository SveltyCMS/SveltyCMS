<!-- 
@file src/components/widgets/imageArray/ImageArray.svelte
@description - ImageArray widget
-->

<script lang="ts">
	import { publicEnv } from '@root/config/public';
	import { saveFormData, getFieldName } from '@utils/utils';
	import type { Params as FieldType } from './types';
	import { createEventDispatcher } from 'svelte';

	// Stores
	import { loadingProgress, validationStore } from '@stores/store';
	import { mode } from '@stores/collectionStore';

	// Components
	import Fields from '@components/Fields.svelte';
	import VerticalList from '@components/VerticalList.svelte';

	// Skeleton
	import { FileDropzone, ProgressBar, Avatar } from '@skeletonlabs/skeleton';

	// valibot validation
	import * as v from 'valibot';

	const dispatch = createEventDispatcher();

	// Props using $props
	let { field } = $props<{ field: FieldType }>();

	// State management using $state
	let files = $state<File[]>([]);
	let _fieldsValue = $state<Record<string, () => any>>({});
	let selectedFiles = $state<string[]>([]);
	let collapsedAll = $state(false);
	let validationError = $state<string | null>(null);
	let name = $state<string>('defaultName');

	// Derived values using $derived
	const optimizedFileName = $derived<string | undefined>(undefined);
	const optimizedMimeType = $derived<string | undefined>(undefined);
	const hashValue = $derived<string | undefined>(undefined);

	// Effect for name initialization
	$effect(() => {
		if (field.db_fieldName) {
			name = getFieldName(field);
		}
	});

	// Define the validation schema for this widget
	const fileSchema = v.object({
		file: v
			.custom<File>((value): value is File => value instanceof File, 'Must be a file')
			.transform((file) => {
				if (file.size > 10 * 1024 * 1024) throw new Error('File size must be less than 10MB');
				if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/svg+xml'].includes(file.type)) {
					throw new Error('Invalid file format');
				}
				return file;
			})
	});

	const widgetSchema = v.array(fileSchema);

	// Generic validation function that uses the provided schema to validate the input
	function validateSchema(schema: typeof widgetSchema, data: any): string | null {
		try {
			v.parse(schema, data);
			validationStore.clearError(name);
			return null; // No error
		} catch (error) {
			if (error instanceof v.ValiError) {
				const errorMessage = error.issues[0]?.message || 'Invalid input';
				validationStore.setError(name, errorMessage);
				return errorMessage;
			}
			return 'Invalid input';
		}
	}

	export const WidgetData = async () => {
		for (let i = 0; i < files.length; i++) {
			const fieldsData = _fieldsValue[i] || {};

			for (const key in fieldsData) {
				console.log(await fieldsData[key]());
			}

			fieldsData.id = crypto.randomUUID();
			await saveFormData(fieldsData);
		}
		if (!files.length) {
			await saveFormData({ data: _fieldsValue });
		}
	};

	// update added files
	function onDropzoneChangeHandler(e: Event): void {
		const input = e.target as HTMLInputElement;
		if (input.files) {
			const newFiles = Array.from(input.files);
			selectedFiles = newFiles.map((file) => file.name);
			files = newFiles;
			validateInput();
		}
	}

	// Validate the input using the generic validateSchema function
	function validateInput() {
		validationError = validateSchema(
			widgetSchema,
			files.map((file: File) => ({ file }))
		);
	}

	const flipDurationMs = 200;
	const handleDndConsider = (e: { detail: { items: Array<{ data: File }> } }) => {
		const updatedItems = e.detail.items;
		files = updatedItems.map((item) => item.data);
	};

	const handleDndFinalize = (e: { detail: { items: Array<{ data: File }> } }) => {
		const updatedItems = e.detail.items;
		files = updatedItems.map((item) => item.data);
	};

	function toggleCollapseAll() {
		collapsedAll = !collapsedAll;

		if (Array.isArray(files)) {
			files = files.map((file) => ({
				...file,
				collapsed: collapsedAll ? false : !file.collapsed
			}));
		}
	}

	function toggleCollapse(index: number) {
		files = files.map((file, i) => (i === index ? { ...file, collapsed: !file.collapsed } : file));
	}

	function deleteImage(index: number) {
		if (!Array.isArray(files)) {
			files = Array.from(files);
		}

		if (index >= 0 && index < files.length) {
			files = files.filter((_, i) => i !== index);

			if (files.length === 0 || files.every((file) => file.collapsed)) {
				collapsedAll = false;
			}
		} else {
			console.error('Invalid index');
		}
	}

	function addMoreImages() {
		dispatch('addMore');
	}

	// Create a FileList-like object for FileDropzone
	$derived(() => {
		const dataTransfer = new DataTransfer();
		files.forEach((file) => dataTransfer.items.add(file));
		return dataTransfer.files;
	});
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

	<VerticalList {files} {flipDurationMs} {handleDndConsider} {handleDndFinalize}>
		{#each files as file, index}
			<div class="relative my-2 rounded border-2 border-surface-300 p-2">
				<div class="flex w-full items-center justify-between {file.collapsed || collapsedAll ? '' : 'border-b pb-2'}">
					<div class="flex items-center gap-2">
						<p class="variant-ghost-primary badge rounded-full">{index}.</p>
						{#if collapsedAll || file.collapsed}
							<Avatar src={URL.createObjectURL(file)} width="w-10" rounded="rounded" />
						{/if}
						<p class="flex-auto font-bold text-primary-500">{file.name}</p>
					</div>

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
							<p class="text-lg font-semibold text-primary-500">
								{#if optimizedFileName}Uploaded File: <span class="text-primary-500">{optimizedFileName}</span>{/if}
								{#if $loadingProgress != 100}Optimized as <span class="uppercase">{publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.format}: </span>{/if}
							</p>
							<p>File size: <span class="text-primary-500">{(file.size / 1024).toFixed(2)} KB</span></p>
							<p>MIME type: <span class="text-primary-500">{optimizedMimeType || file.type}</span></p>
							<p>Hash: <span class="text-primary-500">{hashValue}</span></p>
						</div>
					</div>

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
	<FileDropzone {name} accept="image/*" type="file" multiple on:change={onDropzoneChangeHandler}>
		<svelte:fragment slot="lead"><iconify-icon icon="fa6-solid:file-arrow-up" width="45"></iconify-icon></svelte:fragment>
		<svelte:fragment slot="message"
			><span class="font-bold">Upload <span class="text-primary-500">Multiple </span>files</span> or drag & drop</svelte:fragment
		>
		<svelte:fragment slot="meta">PNG, JPG, GIF, WEBP, AVIF, and SVG allowed.</svelte:fragment>
	</FileDropzone>
{/if}

<!-- Error Message -->
{#if validationError}
	<p id={`${name}-error`} class="text-center text-sm text-error-500">
		{validationError}
	</p>
{/if}
