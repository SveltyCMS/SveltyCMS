<script lang="ts">
	import type { FieldType } from '.';

	import { defaultContentLanguage } from '@src/stores/store';
	import { mode, entryData } from '@src/stores/store';
	import { getFieldName } from '@src/utils/utils';

	export let field: FieldType;

	let fieldName = getFieldName(field);
	export let value = $entryData[fieldName] || {};

	let _data = $mode == 'create' ? {} : value;
	let _language = defaultContentLanguage;
	let valid = true;
	export const WidgetData = async () => _data;

	export let myData: any = null;
	$: myData;

	const handleSubmit = async (event: Event) => {
		console.log('handleSubmit called');

		try {
			const formData = new FormData();
			formData.append('url', encodeURIComponent(value.trim())); // Encode and trim the URL
			const response = await fetch('/api/video', {
				method: 'POST',
				body: formData
			});
			console.log('API Response:', response);

			const data = await response.json();
			console.log('API Data:', data);

			myData = data;
		} catch (error) {
			console.error('Error:', error);
		}
	};

	import * as z from 'zod';

	var widgetValueObject = {
		db_fieldName: field.db_fieldName,
		icon: field.icon,
		placeholder: field.placeholder,
		required: field.required
	};

	const videoSchema = z.object({
		db_fieldName: z.string(),
		icon: z.string().optional(),
		placeholder: z.string().optional(),
		required: z.boolean().optional()
	});

	let validationError: string | null = null;

	$: validationError = (() => {
		try {
			videoSchema.parse(widgetValueObject);
			return null;
		} catch (error) {
			return (error as Error).message;
		}
	})();
</script>

<input
	type="url"
	bind:value
	on:blur={handleSubmit}
	name={field?.db_fieldName}
	id={field?.db_fieldName}
	placeholder={field?.placeholder && field?.placeholder !== ''
		? field?.placeholder
		: field?.db_fieldName}
	required={field?.required}
	class="input flex-1 rounded-none"
/>

{#if !valid}
	<p class="text-error-500">Field is required.</p>
{/if}

{#if myData?.videoUrl}
	<div class="overflow-hidden rounded shadow-lg md:flex md:flex-row">
		<div class="px-6 py-4 md:w-1/2">
			<div class="mb-2 text-xl font-bold text-primary-500">{myData?.videoTitle}</div>
			<table class="text-base">
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
			</table>
			<a
				href={myData?.videoUrl}
				target="_blank"
				rel="noreferrer"
				class="variant-filled-tertiary btn btn-sm mt-4"
			>
				<span><iconify-icon icon="material-symbols:play-circle-outline" width="18" /></span>
				<span>Watch Video</span>
			</a>
		</div>
		<a href={myData?.videoUrl} target="_blank" rel="noreferrer">
			<img
				class="mt-1 w-full md:h-auto md:w-1/2"
				data-sveltekit-preload-data="hover"
				src={myData?.videoThumbnail}
				alt={myData?.videoTitle}
			/>
		</a>
	</div>
{/if}
