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
	import { logger } from '@utils/logger';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Stores
	import { validationStore } from '@stores/store.svelte';
	import { collectionValue } from '@stores/collectionStore.svelte';

	// Components
	import type { MediaImage } from '@utils/media/mediaModels';
	import FileInput from '@components/system/inputs/FileInput.svelte';
	import ImageEditorModal from '@src/components/imageEditor/ImageEditorModal.svelte';
	import { updateMediaMetadata } from '@utils/media/api';
	import { modalState } from '@utils/modalState.svelte';

	// Define reactive state
	let isFlipped = $state(false);

	let validationError: string | null = $state(null);
	let debounceTimeout: number | undefined;

	function openEditor() {
		modalState.trigger(ImageEditorModal as any, {
			image: value instanceof File || !value ? null : value,
			onsave: handleEditorSave,
			modalClasses: 'w-full max-w-7xl'
		});
	}

	// Define props
	let { field, value = $bindable<File | MediaImage | undefined>() } = $props(); // 'value' is the bindable prop

	// Effect to initialize 'value' if it's undefined and a default is available
	// This runs after the component has initialized and 'value' would have received its initial binding
	$effect(() => {
		if (value === undefined && (collectionValue.value as any)[getFieldName(field)] !== undefined) {
			value = (collectionValue.value as any)[getFieldName(field)];
		}
	});

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
			validationError = validateSchema(value);
		}, 300);
	}

	async function handleEditorSave(detail: { dataURL: string; file: File }) {
		const { file: editedFile } = detail;
		// Create form data for the API request
		const formData = new FormData();
		formData.append('processType', 'save');
		formData.append('files', editedFile);

		// TODO: Pass watermark and other options from the field config
		// const watermark = field.watermark;
		// if(watermark) formData.append('watermarkOptions', JSON.stringify(watermark));

		try {
			// Send to media API
			const saveResponse = await fetch('/api/media/process', {
				method: 'POST',
				body: formData
			});

			if (!saveResponse.ok) {
				const errorData = await saveResponse.json();
				throw new Error(errorData.error || 'Failed to save edited image');
			}

			const result = await saveResponse.json();
			if (!result.success || !result.data.data[0]?.success) {
				throw new Error(result.data.data[0]?.error || 'Failed to process edited image');
			}

			// Update the widget data with the new persisted image data
			value = result.data.data[0].data; // Assign directly to the bindable prop
			modalState.close();
		} catch (error) {
			logger.error('Error saving edited image:', error);
		}
	}

	let focalPoint = $state({ x: 50, y: 50 });
	let isDraggingFocalPoint = $state(false);
	let containerRef: HTMLDivElement | undefined = $state(undefined); // Changed to $state

	// Global event handlers
	function handleGlobalMouseMove(event: MouseEvent) {
		if (isDraggingFocalPoint && containerRef) {
			handleFocalPointDrag(event, containerRef);
		}
	}

	function handleGlobalMouseUp() {
		if (isDraggingFocalPoint) {
			saveFocalPoint();
		}
	}

	$effect(() => {
		if (value && !(value instanceof File) && value.metadata?.focalPoint) {
			focalPoint = value.metadata.focalPoint;
		} else {
			focalPoint = { x: 50, y: 50 };
		}
	});

	// Effect to attach/detach global listeners
	$effect(() => {
		if (isDraggingFocalPoint) {
			window.addEventListener('mousemove', handleGlobalMouseMove);
			window.addEventListener('mouseup', handleGlobalMouseUp);
		} else {
			window.removeEventListener('mousemove', handleGlobalMouseMove);
			window.removeEventListener('mouseup', handleGlobalMouseUp);
		}

		// Cleanup on component destroy
		return () => {
			window.removeEventListener('mousemove', handleGlobalMouseMove);
			window.removeEventListener('mouseup', handleGlobalMouseUp);
		};
	});

	function handleFocalPointDrag(event: MouseEvent, container: HTMLDivElement) {
		if (!isDraggingFocalPoint) return;
		const rect = container.getBoundingClientRect();
		let x = ((event.clientX - rect.left) / rect.width) * 100;
		let y = ((event.clientY - rect.top) / rect.height) * 100;

		// Clamp values between 0 and 100
		focalPoint.x = Math.max(0, Math.min(100, x));
		focalPoint.y = Math.max(0, Math.min(100, y));
	}

	async function saveFocalPoint() {
		isDraggingFocalPoint = false;
		if (value && !(value instanceof File) && value._id) {
			try {
				await updateMediaMetadata(value._id, { focalPoint });
				// Optionally show a success toast
			} catch (e) {
				logger.error('Failed to save focal point', e);
				// Optionally show an error toast
			}
		}
	}

	import { getWidgetData } from './widgetData';

	// The `WidgetData` function needs to be explicitly defined or called when needed.
	export async function WidgetDataExport() {
		return getWidgetData(value, field, value);
	}

	// Helper function to get timestamp
	function getTimestamp(date: Date | number | ISODateString): number {
		if (typeof date === 'number') return date;
		if (typeof date === 'string') return isoDateStringToDate(date as ISODateString).getTime();
		return date.getTime();
	}
</script>

<div class="relative mb-4 min-h-1">
	{#if !value}
		<!-- File Input -->
		<div class="rounded-lg border-2 border-dashed border-transparent" class:!border-error-500={!!validationError}>
			<FileInput bind:value bind:multiple={field.multiupload} onChange={validateInput} />
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
						<span class="text-tertiary-500 dark:text-primary-500">{value instanceof File ? value.name : (value as MediaImage).path}</span>
					</p>

					<p class="text-left">
						{m.widget_ImageUpload_Size()}
						<span class="text-tertiary-500 dark:text-primary-500">{((value.size ?? 0) / 1024).toFixed(2)} KB</span>
					</p>
				</div>
				<!-- Image and Actions Container -->
				<div class="flex items-center justify-between">
					{#if !isFlipped}
						<div class="relative col-span-11 m-auto" bind:this={containerRef}>
							<img
								src={value instanceof File ? URL.createObjectURL(value) : value.thumbnails?.sm?.url || value.url}
								alt="Preview"
								class="max-h-[200px] max-w-[500px] rounded"
							/>
							{#if value && !(value instanceof File)}
								<div
									class="absolute cursor-move"
									style={`left: ${focalPoint.x}%; top: ${focalPoint.y}%; transform: translate(-50%, -50%);`}
									onmousedown={() => (isDraggingFocalPoint = true)}
									role="button"
									tabindex="0"
									aria-label="Set focal point"
								>
									<iconify-icon icon="mdi:plus-circle-outline" width="24" class="text-primary-500 drop-shadow-lg"></iconify-icon>
								</div>
							{/if}
						</div>
					{:else}
						<div class="col-span-11 ml-2 grid grid-cols-2 gap-1 text-left">
							<p class="">{m.widget_ImageUpload_Type()}</p>
							<p class="font-bold text-tertiary-500 dark:text-primary-500">{(value as any).type}</p>
							<p class="">Path:</p>
							<p class="font-bold text-tertiary-500 dark:text-primary-500">{(value as any).path}</p>
							<p class="">{m.widget_ImageUpload_Uploaded()}</p>
							<p class="font-bold text-tertiary-500 dark:text-primary-500">
								{convertTimestampToDateString(getTimestamp((value as any) instanceof File ? (value as any).lastModified : (value as any).createdAt))}
							</p>
							<p class="">{m.widget_ImageUpload_LastModified()}</p>
							<p class="font-bold text-tertiary-500 dark:text-primary-500">
								{convertTimestampToDateString(getTimestamp((value as any) instanceof File ? (value as any).lastModified : (value as any).updatedAt))}
							</p>
						</div>
					{/if}

					<!-- Buttons -->
					<div class="col-span-1 flex flex-col items-end justify-between gap-2 p-2">
						<!-- Edit -->
						<button onclick={openEditor} aria-label="Edit image" class="preset-ghost btn-icon" title="Edit image">
							<iconify-icon icon="material-symbols:edit" width="24" class="text-primary-500"></iconify-icon>
						</button>

						<!-- Flip -->
						<button onclick={() => (isFlipped = !isFlipped)} aria-label="Flip" class="preset-ghost btn-icon" title="Flip details">
							<iconify-icon
								icon="uiw:reload"
								width="24"
								class={isFlipped ? ' rotate-90 text-yellow-500 transition-transform duration-300' : 'text-white  transition-transform duration-300'}
							></iconify-icon>
						</button>

						<!-- Delete -->
						<button onclick={() => (value = undefined)} aria-label="Delete" class="preset-ghost btn-icon" title="Delete image">
							<iconify-icon icon="material-symbols:delete-outline" width="30" class="text-error-500"></iconify-icon>
						</button>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Error Message -->
	{#if validationError}
		<p id={`${getFieldName(field)}-error`} class="absolute -bottom-4 left-0 w-full text-center text-xs text-error-500" role="alert">
			{validationError}
		</p>
	{/if}
</div>
