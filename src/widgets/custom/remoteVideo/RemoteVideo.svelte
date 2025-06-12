<!-- 
@file src/widgets/custom/remoteVideo/RemoteVideo.svelte
@component
**RemoteVideo widget to embed remote videos in your content.**

@example
<RemoteVideo label="Video URL" db_fieldName="videoUrl" required={true} />

### Props
- `field`: FieldType
- `value`: any

### Features
- Translatable
-->

<script lang="ts">
	import type { FieldType } from '.';
	import { getFieldName } from '@utils/utils';

	// Stores
	import { validationStore } from '@stores/store.svelte';
	import { mode, collectionValue } from '@stores/collectionStore.svelte';
	import { contentLanguage } from '@stores/store.svelte';

	interface Props {
		field: FieldType;
		show?: boolean;
		key?: string;
		active?: string;
		onChange?: (color: string) => void;
	}

	let { field }: Props = $props();

	const fieldName = getFieldName(field);

	// States
	let value = $state(collectionValue.value[fieldName] || '');
	let validationError = $state<string | null>(null);
	let debounceTimeout = $state<number | undefined>(undefined);
	let myData = $state<any>(null);

	// Get the derived value
	const _data = $derived(mode.value === 'create' ? {} : value);
	const _language = $derived(contentLanguage);

	// Export widget data function
	export const WidgetData = async () => _data;

	// Valibot
	import * as v from 'valibot';
	import { pipe, transform, object, optional, string, url, boolean, number } from 'valibot';

	// Define the validation schema for this widget
	const valueSchema = pipe(
		string(),
		transform((value: string) => {
			if (!value) return '';
			// Ensure the URL has a protocol
			if (!value.startsWith('http://') && !value.startsWith('https://')) {
				value = 'https://' + value;
			}
			return value;
		}),
		url('Invalid URL format')
	);

	const widgetSchema = object({
		value: optional(valueSchema),
		db_fieldName: string(),
		icon: optional(string()),
		color: optional(string()),
		size: optional(string()),
		width: optional(number()),
		required: optional(boolean())
	});

	// Generic validation function that uses the provided schema to validate the input
	function validateSchema(data: unknown): string | null {
		try {
			v.parse(widgetSchema, data);
			validationStore.clearError(fieldName);
			return null; // No error
		} catch (error) {
			if ((error as v.ValiError<typeof widgetSchema>).issues) {
				const valiError = error as v.ValiError<typeof widgetSchema>;
				const errorMessage = valiError.issues[0]?.message || 'Invalid input';
				validationStore.setError(fieldName, errorMessage);
				return errorMessage;
			}
			return 'Invalid input';
		}
	}

	// Debounced validation function
	function handleInput(event: Event) {
		event.preventDefault();
		if (debounceTimeout) clearTimeout(debounceTimeout);
		debounceTimeout = window.setTimeout(() => {
			const value = _data[_language];
			validationError = validateSchema({
				value: value || '',
				db_fieldName: field.db_fieldName,
				required: field.required
			});
		}, 300);
	}

	// Handle video URL submission
	async function handleSubmit() {
		if (!value.trim()) return; // Don't fetch data if input is empty

		try {
			const formData = new FormData();
			formData.append('url', value.trim());
			const response = await fetch('/api/video', {
				method: 'POST',
				body: formData
			});
			const data = await response.json();
			myData = data;

			console.log('Video data fetched successfully', { myData });
		} catch (error) {
			console.log('Error fetching video data', error as Error);
		}
	}
</script>

<div class="input-container relative mb-4">
	<!-- URL Input -->
	<input
		type="url"
		bind:value={_data[_language]}
		oninput={handleInput}
		class="input w-full text-black dark:text-primary-500"
		class:error={!!validationError}
		aria-invalid={!!validationError}
		aria-describedby={validationError ? `${field.db_fieldName}-error` : undefined}
		required={field?.required}
		placeholder="https://example.com/video"
	/>

	<!-- Error Message -->
	{#if validationError}
		<p id={`${field.db_fieldName}-error`} class="absolute bottom-[-1rem] left-0 w-full text-center text-xs text-error-500" role="alert">
			{validationError}
		</p>
	{/if}
</div>

{#if myData?.videoUrl}
	<div class="overflow-hidden rounded shadow-lg md:flex md:flex-row">
		<div class="px-6 py-4 md:w-1/2">
			<div class="mb-2 text-xl font-bold text-primary-500">{myData?.videoTitle}</div>
			<table class="text-base">
				<tbody>
					<tr>
						<td class="pr-4">User:</td>
						<td class="text-tertiary-500">{myData?.user_name}</td>
					</tr>
					<tr>
						<td class="pr-4">Dimension:</td>
						<td class="text-tertiary-500">{myData?.height}px x {myData?.width}px (height x width)</td>
					</tr>
					<tr>
						<td class="pr-4">Duration:</td>
						<td class="text-tertiary-500">{myData?.duration} min</td>
					</tr>
				</tbody>
			</table>
			<a href={myData?.videoUrl} target="_blank" rel="noreferrer" class="variant-filled-tertiary btn btn-sm mt-4">
				<span><iconify-icon icon="material-symbols:play-circle-outline" width="18"></iconify-icon></span>
				<span>Watch Video</span>
			</a>
		</div>
		<a href={myData?.videoUrl} target="_blank" rel="noreferrer">
			<img
				class="mt-1 w-full md:h-auto md:w-1/2"
				data-sveltekit-preload-data="hover"
				src={myData?.videoThumbnail}
				alt={myData?.videoTitle}
				loading="lazy"
			/>
		</a>
	</div>
{/if}

<style lang="postcss">
	.input-container {
		min-height: 2.5rem;
	}

	.error {
		border-color: rgb(239 68 68);
	}
</style>
