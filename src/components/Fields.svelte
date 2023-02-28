<script lang="ts">
	import { entryData, getFieldsData, language } from '$src/stores/store';
	import { PUBLIC_TRANSLATIONS } from '$env/static/public';
	import type { Schema } from '$src/collections/types';
	import { onMount } from 'svelte';
	// Icons from https://icon-sets.iconify.design/
	import Icon from '@iconify/svelte';

	export let root = true; // if field is not nested. eg. not part of menu's fields
	export let fields: Array<any> = [];
	export let value: any = undefined;
	export let collection: Schema | undefined = undefined;
	export let inputFields: Array<HTMLDivElement> = [];
	export let fieldsValue: any = {};
	export let getData = async () => {
		return fieldsValue;
	};

	onMount(async () => {
		$getFieldsData.add(getData);
	});
	// $: console.log(fieldsValue.width);
</script>

{#each fields as field, index}
	<!-- width does not seam to apply -->
	<div
		bind:this={inputFields[index]}
		class="section relative my-2  {!field.field.width ? 'w-full' : 'max-md:!w-full'}"
		style={field.field.width && `width:${field.field.width.replace('%', '') * 1 - 1}%`}
	>
		<div class="relative flex">
			<p class="font-semibold">
				{field.field.db_fieldName}

				{#if field.field.required}
					<span class="ml-1 pb-3 text-error-500">*</span>
				{/if}
			</p>

			<div class="absolute right-0 flex gap-4">
				{#if field.field.localization}
					<div class="flex items-center gap-1 px-2">
						<Icon icon="bi:translate" color="dark" width="18" class="text-sm" />
						<div class="text-xs font-normal text-error-500">
							{JSON.parse(PUBLIC_TRANSLATIONS)[$language]}
						</div>
					</div>
				{/if}
				{#if field.field.icon}
					<Icon icon={field.field.icon} color="dark" width="22" class="w-10" />
				{:else}
					<div class="w-[40px]" />
				{/if}
			</div>
		</div>
		<!-- display all widget fields -->
		{#if field.widget}
			<svelte:component
				this={field.widget}
				{collection}
				bind:widgetValue={fieldsValue[field.field.db_fieldName]}
				{root}
				value={value
					? value?.[field.field.db_fieldName]
					: $entryData?.[field.field.db_fieldName] || null}
				field={field.field}
			/>
		{/if}
	</div>
{/each}
