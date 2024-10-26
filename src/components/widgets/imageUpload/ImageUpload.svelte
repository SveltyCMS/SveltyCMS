<!-- 
@file src/components/widgets/imageUpload/ImageUpload.svelte
@description - ImageUpload widget
-->

<script lang="ts">
	import type { FieldType } from '.';
	import { convertTimestampToDateString, getFieldName, meta_data } from '@utils/utils';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Stores
	import { validationStore } from '@stores/store';
	import { mode, collectionValue } from '@stores/collectionStore';

	// Components
	import type { MediaImage, Thumbnail } from '@utils/media/mediaModels';
	import FileInput from '@components/system/inputs/FileInput.svelte';

	let isFlipped = false; // State variable to track flip button

	export let field: FieldType & { path: string };
	export let value: File | MediaImage = $collectionValue[getFieldName(field)]; // pass file directly from imageArray

	let _data: File | MediaImage | undefined = value;

	$: updated = _data !== value;

	let validationError: string | null = null;

	// Define the validation schema for this widget
	import { object, string, number, union, instance, check, pipe, record, parse, type InferInput, type ValiError } from 'valibot';

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
	type WidgetSchemaType = InferInput<typeof widgetSchema>;

	// Generic validation function that uses the provided schema to validate the input
	function validateSchema(data: unknown): string | null {
		try {
			parse(widgetSchema, data);
			validationStore.clearError(getFieldName(field));
			return null; // No error
		} catch (error) {
			if ((error as ValiError<typeof widgetSchema>).issues) {
				const valiError = error as ValiError<typeof widgetSchema>;
				const errorMessage = valiError.issues[0]?.message || 'Invalid input';
				validationStore.setError(getFieldName(field), errorMessage);
				return errorMessage;
			}
			return 'Invalid input';
		}
	}

	function validateInput() {
		validationError = validateSchema(_data);
	}

	export const WidgetData = async () => {
		if (_data) {
			if (_data instanceof File) {
				_data.path = field.path;
			}
		}

		if (!(value instanceof File) && !(_data instanceof File) && _data?._id !== value?._id && value?._id && $mode == 'edit') {
			meta_data.add('media_images_remove', [value._id.toString()]);
		}

		validateInput();

		//if not updated value is not changed and is MediaImage type so send back only id
		return updated || $mode == 'create' ? _data : { _id: (value as MediaImage)?._id };
	};

	function getTimestamp(date: Date | number): number {
		return typeof date === 'number' ? date : date.getTime();
	}
</script>

{#if !_data}
	<!-- File Input -->
	<FileInput
		bind:value={_data}
		bind:multiple={field.multiupload}
		on:change={validateInput}
		aria-invalid={!!validationError}
		aria-describedby={validationError ? `${getFieldName(field)}-error` : undefined}
	/>
{:else}
	<div class="flex w-full max-w-full flex-col border-2 border-dashed border-surface-600 bg-surface-200 dark:border-surface-500 dark:bg-surface-700">
		<!-- Preview -->
		<div class="mx-2 flex flex-col gap-2">
			<!-- Image Header -->
			<div class="flex items-center justify-between gap-2">
				<p class="text-left">{m.widget_ImageUpload_Name()} <span class="text-tertiary-500 dark:text-primary-500">{_data.name}</span></p>

				<p class="text-left">
					{m.widget_ImageUpload_Size()} <span class="text-tertiary-500 dark:text-primary-500">{(_data.size / 1024).toFixed(2)} KB</span>
				</p>
			</div>
			<!-- Image-->
			<div class="flex items-center justify-between">
				{#if !isFlipped}
					<img
						src={_data instanceof File ? URL.createObjectURL(_data) : _data.thumbnails.thumbnail.url}
						alt=""
						class="col-span-11 m-auto max-h-[200px] max-w-[500px] rounded"
					/>
				{:else}
					<div class="col-span-11 ml-2 grid grid-cols-2 gap-1 text-left">
						<p class="">{m.widget_ImageUpload_Type()}</p>
						<p class="font-bold text-tertiary-500 dark:text-primary-500">{_data.type}</p>
						<p class="">Path:</p>
						<p class="font-bold text-tertiary-500 dark:text-primary-500">{_data.path}</p>
						<p class="">{m.widget_ImageUpload_Uploaded()}</p>
						<p class="font-bold text-tertiary-500 dark:text-primary-500">
							{convertTimestampToDateString(getTimestamp(_data instanceof File ? _data.lastModified : _data.createdAt))}
						</p>
						<p class="">{m.widget_ImageUpload_LastModified()}</p>
						<p class="font-bold text-tertiary-500 dark:text-primary-500">
							{convertTimestampToDateString(getTimestamp(_data instanceof File ? _data.lastModified : _data.updatedAt))}
						</p>
					</div>
				{/if}

				<!-- Buttons -->
				<div class="col-span-1 flex flex-col items-end justify-between gap-2 p-2">
					<!-- Flip -->
					<button on:click={() => (isFlipped = !isFlipped)} class="variant-ghost btn-icon">
						<iconify-icon
							icon="uiw:reload"
							width="24"
							class={isFlipped ? ' rotate-90 text-yellow-500 transition-transform duration-300' : 'text-white  transition-transform duration-300'}
						/>
					</button>

					<!-- Delete -->
					<button on:click={() => (_data = undefined)} class="variant-ghost btn-icon">
						<iconify-icon icon="material-symbols:delete-outline" width="30" class="text-error-500" />
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Error Message -->
{#if validationError}
	<p id={`${getFieldName(field)}-error`} class="text-center text-sm text-error-500">
		{validationError}
	</p>
{/if}
