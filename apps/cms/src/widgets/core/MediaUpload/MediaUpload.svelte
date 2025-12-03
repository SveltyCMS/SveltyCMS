<!--
@file src/widgets/core/MediaUpload/MediaUpload.svelte
@component
**Media Upload Widget Component**

This component allows users to upload and manage single media files (images).
It integrates with a media library modal for selecting existing assets and provides
functionality for image editing and basic file information display.

### Props
- `field`: FieldType & { path: string } - Configuration for the media upload field, including validation rules and storage path.
- `value`: File | MediaImage - The currently selected file or media image object.

### Features
- **File Upload**: Allows direct file uploads via a file input.
- **Media Library Integration**: Opens a modal to select existing media from the library.
- **Image Preview**: Displays a preview of the selected image.
- **Image Editing**: Provides an option to open a modal for image manipulation.
- **File Information Display**: Shows details like file name, size, type, and timestamps.
- **Validation**: Integrates with Valibot for client-side validation of file types.
- **Reactivity**: Uses Svelte 5 runes (`$state`, `$props`, `$effect`) for efficient state management.
- **Styling**: Adheres to the project's style guide using Tailwind CSS utility classes and semantic colors.
-->

<script lang="ts">
	import type { ISODateString } from '@src/content/types';
	import { convertTimestampToDateString, getFieldName } from '@utils/utils';
	import { isoDateStringToDate } from '@utils/dateUtils';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Stores
	import { validationStore } from '@stores/store.svelte';
	import { collectionValue } from '@stores/collectionStore.svelte';

	// Components
	import type { MediaImage } from '@utils/media/mediaModels';
	import FileInput from '@components/system/inputs/FileInput.svelte';
	import { getModalStore, type ModalSettings, type ModalComponent } from '@skeletonlabs/skeleton';
	import ModalImageEditor from './ModalImageEditor.svelte';

	// Define reactive state
	let isFlipped = $state(false);
	let _data: File | MediaImage | undefined = $state(undefined); // Initialize with `undefined`
	let validationError: string | null = $state(null);
	let debounceTimeout: number | undefined;
	const modalStore = getModalStore();

	function openImageEditor() {
		const modalComponent: ModalComponent = {
			ref: ModalImageEditor,
			props: {
				_data: _data,
				onClose: modalStore.close,
				mediaOnSelect: (file: File | MediaImage) => {
					_data = file;
					validateInput();
				}
			}
		};
		const modal: ModalSettings = {
			type: 'component',
			component: modalComponent
		};
		modalStore.trigger(modal);
	}

	// Define props
	const { field, value = (collectionValue as any)[getFieldName(field)] } = $props();

	// Define validation schema
	import { object, string, number, union, instance, check, pipe, record, parse, type ValiError } from 'valibot';

	const validImageTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/svg+xml'];

	const fileSchema = pipe(
		instance(File),
		check((input: File) => validImageTypes.includes(input.type), 'Invalid file format')
	);

	const thumbnailSchema = object({
		width: number(),
		height: number(),
		url: string()
	});

	const mediaImageSchema = object({
		_id: string(),
		name: string(),
		type: string(),
		size: number(),
		path: string(),
		thumbnails: record(string(), thumbnailSchema),
		createdAt: number(),
		updatedAt: number()
	});

	const widgetSchema = union([fileSchema, mediaImageSchema]);

	// Validation function
	function validateSchema(data: unknown): string | null {
		try {
			parse(widgetSchema, data);
			validationStore.clearError(getFieldName(field));
			return null;
		} catch (error) {
			if ((error as ValiError<any>).issues) {
				const valiError = error as ValiError<any>;
				const errorMessage = valiError.issues[0]?.message || 'Invalid input';
				validationStore.setError(getFieldName(field), errorMessage);
				return errorMessage;
			}
			return 'Invalid input';
		}
	}

	// Validate input with debounce
	function validateInput() {
		if (debounceTimeout) clearTimeout(debounceTimeout);
		debounceTimeout = window.setTimeout(() => {
			validationError = validateSchema(_data);
		}, 300);
	}

	import { getWidgetData } from './widgetData';

	// The `WidgetData` function needs to be explicitly defined or called when needed.
	// Since it was exported, it means it was part of the component's public API.
	// In Svelte 5, component functions usually are regular functions and can be exported as part of the component's module.
	// Let's create a wrapper function that calls `getWidgetData`.
	export async function WidgetDataExport() {
		return getWidgetData(_data, field, value);
	}

	// Helper function to get timestamp
	function getTimestamp(date: Date | number | ISODateString): number {
		if (typeof date === 'number') return date;
		if (typeof date === 'string') return isoDateStringToDate(date as ISODateString).getTime();
		return date.getTime();
	}
</script>

<div class="relative mb-4 min-h-1">
	{#if !_data}
		<!-- File Input -->
		<div class="rounded-lg border-2 border-dashed border-transparent" class:!border-error-500={!!validationError}>
			<FileInput bind:value={_data} bind:multiple={field.multiupload} onChange={validateInput} />
		</div>
	{:else}
		<div
			class="flex w-full max-w-full flex-col border-2 border-dashed border-surface-600 bg-surface-200 dark:border-surface-500 dark:bg-surface-700"
			class:error={!!validationError}
		>
			<!-- Preview -->
			<div class="mx-2 flex flex-col gap-2">
				<!-- Image Header -->
				<div class="flex items-center justify-between gap-2">
					<p class="text-left">
						{m.widget_ImageUpload_Name()}
						<span class="text-tertiary-500 dark:text-primary-500">{_data instanceof File ? _data.name : (_data as MediaImage).path}</span>
					</p>

					<p class="text-left">
						{m.widget_ImageUpload_Size()}
						<span class="text-tertiary-500 dark:text-primary-500">{((_data.size ?? 0) / 1024).toFixed(2)} KB</span>
					</p>
				</div>
				<!-- Image -->
				<div class="flex items-center justify-between">
					{#if !isFlipped}
						<img
							src={_data instanceof File ? URL.createObjectURL(_data) : _data.thumbnails?.sm?.url || _data.url}
							alt=""
							class="col-span-11 m-auto max-h-[200px] max-w-[500px] rounded"
						/>
					{:else}
						<div class="col-span-11 ml-2 grid grid-cols-2 gap-1 text-left">
							<p class="">{m.widget_ImageUpload_Type()}</p>
							<p class="font-bold text-tertiary-500 dark:text-primary-500">{(_data as any).type}</p>
							<p class="">Path:</p>
							<p class="font-bold text-tertiary-500 dark:text-primary-500">{(_data as any).path}</p>
							<p class="">{m.widget_ImageUpload_Uploaded()}</p>
							<p class="font-bold text-tertiary-500 dark:text-primary-500">
								{convertTimestampToDateString(getTimestamp((_data as any) instanceof File ? (_data as any).lastModified : (_data as any).createdAt))}
							</p>
							<p class="">{m.widget_ImageUpload_LastModified()}</p>
							<p class="font-bold text-tertiary-500 dark:text-primary-500">
								{convertTimestampToDateString(getTimestamp((_data as any) instanceof File ? (_data as any).lastModified : (_data as any).updatedAt))}
							</p>
						</div>
					{/if}

					<!-- Buttons -->
					<div class="col-span-1 flex flex-col items-end justify-between gap-2 p-2">
						<!-- Edit -->
						<button onclick={openImageEditor} aria-label="Edit image" class="variant-ghost btn-icon" title="Edit image">
							<iconify-icon icon="material-symbols:edit" width="24" class="text-primary-500"></iconify-icon>
						</button>

						<!-- Flip -->
						<button onclick={() => (isFlipped = !isFlipped)} aria-label="Flip" class="variant-ghost btn-icon" title="Flip details">
							<iconify-icon
								icon="uiw:reload"
								width="24"
								class={isFlipped ? ' rotate-90 text-yellow-500 transition-transform duration-300' : 'text-white  transition-transform duration-300'}
							></iconify-icon>
						</button>

						<!-- Delete -->
						<button onclick={() => (_data = undefined)} aria-label="Delete" class="variant-ghost btn-icon" title="Delete image">
							<iconify-icon icon="material-symbols:delete-outline" width="30" class="text-error-500"></iconify-icon>
						</button>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Error Message -->
	{#if validationError}
		<p id={`${getFieldName(field)}-error`} class="absolute bottom-[-1rem] left-0 w-full text-center text-xs text-error-500" role="alert">
			{validationError}
		</p>
	{/if}
</div>
