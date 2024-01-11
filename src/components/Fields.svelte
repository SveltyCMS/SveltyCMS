<script lang="ts">
	import { collectionValue, contentLanguage, collection, entryData } from '@stores/store';
	//console.log($entryData);
	import { asAny, getFieldName } from '@utils/utils';

	export let fields: typeof $collection.fields | undefined = undefined;
	export let root = true; // if Fields is not part of any widget.
	export let fieldsData = {};
	export let customData = {};

	$: if (root) $collectionValue = fieldsData;
</script>

<div class="py-1 text-center text-xs text-error-500">* Required</div>
<div class="wrapper">
	{#each fields || $collection.fields as field}
		{#if field.widget}
			{#key $collection}
				<div
					class=" mx-auto text-center {!field?.width ? 'w-full' : 'max-md:!w-full'}"
					style={'min-width:min(300px,100%);' + (field?.width ? `width:${Math.floor(100 / field?.width)}%` : '')}
				>
					<!-- Widget label -->
					<div class="inline-block w-full justify-between px-[5px] text-start">
						<div class="flex justify-between px-[5px] text-start">
							<!-- db_fieldName or label  -->
							<!-- TODO: Get translated Name -->
							<p class="inline-block font-semibold capitalize">
								{#if field.label}
									{field.label}
								{:else}
									{field.db_fieldName}
								{/if}
								<!-- {#if field.required}
								<span class="ml-1 pb-3 text-error-500">*</span>
							{/if} -->
							</p>

							<div class="flex gap-2">
								<!-- Widget translated  -->
								{#if 'translated' in field && field.translated}
									<div class="flex items-center gap-1 px-2">
										<iconify-icon icon="bi:translate" color="dark" width="18" class="text-sm" />
										<div class="text-xs font-normal text-error-500">
											{$contentLanguage.toUpperCase()}
										</div>
									</div>
								{/if}

								<!-- Widget icon -->
								{#if 'icon' in field && field.icon}
									<iconify-icon icon={field?.icon} color="dark" width="22" class="" />
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
				</div>
			{/key}
		{/if}
	{/each}
</div>

<style>
	.wrapper {
		overflow: auto;
		max-height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		/* flex-direction: column; */
		flex-wrap: wrap;
		width: 100%;
		height: 100%;
	}
</style>
