<script lang="ts">
	// Stores
	import { collectionValue, contentLanguage, collection, entryData } from '@stores/store';

	// skeleton
	import { TabGroup, Tab, TabAnchor } from '@skeletonlabs/skeleton';
	let tabSet: number = 0;

	// console.log($entryData);
	import { asAny, getFieldName } from '@utils/utils';

	export let fields: typeof $collection.fields | undefined = undefined;
	export let root = true; // if Fields is not part of any widget.
	export let fieldsData = {};
	export let customData = {};

	$: if (root) $collectionValue = fieldsData;
</script>

<TabGroup justify="justify-between items-center" class="">
	<Tab bind:group={tabSet} name="tab1" value={0}>
		<div class="flex items-center gap-1">
			<iconify-icon icon="mdi:pen" width="24" class="text-primary-500" />
			<p>Edit</p>
		</div>
	</Tab>
	<Tab bind:group={tabSet} name="tab2" value={1}>
		<div class="flex items-center gap-1">
			<iconify-icon icon="pepicons-pop:countdown" width="24" class="text-primary-500" />
			<p>Ver. <span class="variant-outline-primary badge rounded-full">1</span></p>
		</div>
	</Tab>
	<Tab bind:group={tabSet} name="tab3" value={2}>
		<div class="flex items-center gap-1">
			<iconify-icon icon="ant-design:api-outlined" width="24" class="text-primary-500" />
			<p>API</p>
		</div>
	</Tab>

	<!-- Tab Panels --->
	<svelte:fragment slot="panel">
		<!-- Data -->
		{#if tabSet === 0}
			<div class="text-center text-xs text-error-500">* Required</div>

			<div class="flex flex-wrap items-center justify-center gap-1 overflow-auto">
				{#each fields || $collection.fields as field}
					{#if field.widget}
						{#key $collection}
							<div
								class="mx-auto text-center {!field?.width ? 'w-full ' : 'max-md:!w-full'}"
								style={'min-width:min(300px,100%);' + (field?.width ? `width:calc(${Math.floor(100 / field?.width)}% - 0.25rem)` : '')}
							>
								<!-- Widget label -->
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
						{/key}
					{/if}
				{/each}
			</div>
		{:else if tabSet === 1}
			<!-- Revision -->
			<div class="flex w-full items-center justify-between text-center text-white">
				<div class="">
					February 20th 2024, 6:00 PM
					<code class="code">text here </code>
				</div>
				<div class="inline-block w-0.5 self-stretch bg-neutral-100 opacity-100 dark:opacity-50"></div>
				<div class="ml-2">
					February 19th 2024, 4:00 PM
					<code class="code">text here </code>
				</div>
			</div>
		{:else if tabSet === 2}
			<!-- Api Json -->
			<div class="flex items-center justify-center">
				url
				<code class="code m-2">Json Api here soon </code>
			</div>
		{/if}
	</svelte:fragment>
</TabGroup>
