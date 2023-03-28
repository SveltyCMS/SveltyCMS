<script lang="ts">
	// Icons from https://icon-sets.iconify.design/
	import Icon from '@iconify/svelte';

	export let field: any = undefined;
	export let value = '';

	export let widgetValue;
	$: widgetValue = value;

	$: if (value) {
		console.log(value);
	}

	export let myData: any = null;

	$: myData;
	const handleSubmit = async (event: Event) => {
		const formData = new FormData();
		formData.append('url', value);
		const response = fetch('/api/video', {
			method: 'POST',
			body: formData
		});
		const data = await (await response).json();
		myData = data;
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
	required
	placeholder="Paste a Video URL here"
	type="text"
	name="url"
	bind:value
	on:blur={handleSubmit}
	class="input w-full rounded-md"
/>

{#if myData?.videoUrl}
	<div class="rounded overflow-hidden mt-2 shadow-lg md:flex md:flex-row">
		<div class="px-6 py-4 md:w-1/2">
			<div class="font-bold text-xl mb-2 text-primary-500">{myData?.videoTitle}</div>
			<table class="text-base">
				<tr>
					<td class="pr-4">User:</td>
					<td class="text-tertiary-500 font-semibold">{myData?.user_name}</td>
				</tr>
				<tr>
					<td class="pr-4">Dimension:</td>
					<td class="text-tertiary-500 font-semibold"
						>{myData?.height} x {myData?.width} (height x width)</td
					>
				</tr>
				<tr>
					<td class="pr-4">Duration:</td>
					<td class="text-tertiary-500 font-semibold">{myData?.duration} min</td>
				</tr>
			</table>
			<a
				href={myData?.videoUrl}
				target="_blank"
				rel="noreferrer"
				class="btn btn-sm mt-4 variant-filled-tertiary"
			>
				<span><Icon icon="material-symbols:play-circle-outline" width="18" /></span>
				<span>Watch Video</span>
			</a>
		</div>
		<img
			class="mt-1 w-full md:w-1/2 md:h-auto"
			data-sveltekit-preload-data="hover"
			src={myData?.videoThumbnail}
			alt={myData?.videoTitle}
		/>
	</div>
{/if}
