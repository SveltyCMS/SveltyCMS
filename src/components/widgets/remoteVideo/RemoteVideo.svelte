<script lang="ts">
	import type { FieldType } from '.';
	import { getFieldName } from '@utils/utils';

	// Stores
	import { mode, entryData } from '@stores/store';

	export let field: FieldType;

	const fieldName = getFieldName(field);
	export let value = $entryData[fieldName] || '';

	const _data = $mode == 'create' ? {} : value;
	let validationError: string | null = null;

	export const WidgetData = async () => _data;

	export let myData: any = null;
	$: myData;

	async function handleSubmit() {
		if (!value.trim()) return; // Don't fetch data if input is empty

		try {
			const formData = new FormData();
			formData.append('url', value.trim()); // Pass the URL without encoding
			const response = await fetch('/api/video', {
				method: 'POST',
				body: formData
			});
			// console.log('API Response:', response);

			const data = await response.json();
			// console.log('API Data:', data);

			myData = data;

			console.log('Video Data:', myData);
		} catch (error) {
			console.error('Error:', error);
		}
	}

	// zod validation
	import * as z from 'zod';

	// Customize the error messages for each rule
	const validateSchema = z.object({
		db_fieldName: z.string(),
		icon: z.string().optional(),
		color: z.string().optional(),
		width: z.number().optional(),
		required: z.boolean().optional()

		// Widget Specfic
	});

	function validateInput() {
		try {
			// Change .parseAsync to .parse
			validateSchema.parse(_data.value);
			validationError = '';
		} catch (error: unknown) {
			if (error instanceof z.ZodError) {
				validationError = error.errors[0].message;
			}
		}
	}
</script>

<input
	type="url"
	bind:value
	on:change={handleSubmit}
	on:input={validateInput}
	name={field?.db_fieldName}
	id={field?.db_fieldName}
	placeholder={field?.placeholder || field?.db_fieldName}
	required={field?.required}
	class="input text-black dark:text-primary-500"
/>

<!-- Error Message -->
{#if validationError !== null}
	<p class="text-center text-sm text-error-500">{validationError}</p>
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
			<a href={myData?.videoUrl} target="_blank" rel="noreferrer" class="variant-filled-tertiary btn btn-sm mt-4">
				<span><iconify-icon icon="material-symbols:play-circle-outline" width="18" /></span>
				<span>Watch Video</span>
			</a>
		</div>
		<a href={myData?.videoUrl} target="_blank" rel="noreferrer">
			<img class="mt-1 w-full md:h-auto md:w-1/2" data-sveltekit-preload-data="hover" src={myData?.videoThumbnail} alt={myData?.videoTitle} />
		</a>
	</div>
{/if}
