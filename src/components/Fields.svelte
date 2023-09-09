<script lang="ts">
	import { collectionValue, contentLanguage, collection } from '@src/stores/store';

	import { asAny, getFieldName } from '@src/utils/utils';

	export let fields: typeof $collection.fields | undefined = undefined;

	export let root = true; // if Fields is not part of any widget.
	export let fieldsData = {};
	export let customData = {};

	$: if (root) $collectionValue = fieldsData;
</script>

<div class="py-1 text-center text-xs text-error-500">* Required</div>
<div class="m-2">
	{#each fields || $collection.fields as field, index}
		<!-- widget width -->
		<!-- <div
	bind:this={inputFields[index]}
	class="section relative my-2 {!field.width ? 'w-full' : 'max-md:!w-full'}"
	style={field.width && `width:${field.width.replace('%', '') * 1 - 1}%`}
> -->
		{#if field.widget}
			{#key $collection}
				<div>
					<!-- Widget label -->
					<div class=" mb-0.5 flex items-center justify-between">
						<!-- db_fieldName or label  -->
						<!-- TODO: Get translated Name -->
						<p class="font-semibold capitalize">
							{#if field.label}
								{field.label}
							{:else}
								{field.db_fieldName}
							{/if}
							{#if field.required}
								<span class="ml-1 pb-3 text-error-500">*</span>
							{/if}
						</p>

						<div class="flex gap-2">
							<!-- Widget translated  -->
							{#if field.translated}
								<div class="flex items-center gap-1 px-2">
									<iconify-icon icon="bi:translate" color="dark" width="18" class="text-sm" />
									<div class="text-xs font-normal text-error-500">
										{$contentLanguage.toUpperCase()}
									</div>
								</div>
							{/if}

							<!-- Widget icon -->
							{#if field.icon}
								<iconify-icon icon={field.icon} color="dark" width="22" class="" />
							{/if}
						</div>
					</div>

					<!-- Widget Input -->
					<svelte:component
						this={asAny(field.widget.type)}
						field={asAny(field)}
						bind:WidgetData={fieldsData[getFieldName(field)]}
						value={customData[getFieldName(field)]}
						{...$$props}
					/>
				</div>
			{/key}
		{/if}
	{/each}
</div>
