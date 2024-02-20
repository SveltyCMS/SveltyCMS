<script lang="ts">
	// Stores
	import { collectionValue, contentLanguage, collection } from '@stores/store';

	// Skeleton
	import { TabGroup, Tab, TabAnchor, CodeBlock, clipboard } from '@skeletonlabs/skeleton';
	let tabSet: number = 0;

	// console.log($entryData);
	import { asAny, getFieldName } from '@utils/utils';

	export let fields: typeof $collection.fields | undefined = undefined;
	export let root = true; // if Fields is not part of any widget.
	export let fieldsData = {};
	export let customData = {};

	$: if (root) $collectionValue = fieldsData;
</script>

<TabGroup
	justify=" {$collection.revision === true ? 'justify-between' : 'justify-center '} items-center"
	rounded="rounded-tl-container-token rounded-tr-container-token"
	flex="flex-1 items-center"
	active="border-b border-primary-500 variant-soft-secondary"
	hover="hover:variant-soft-secondary"
>
	<!-- Data -->
	<Tab bind:group={tabSet} name="tab1" value={0}>
		<div class="flex items-center gap-1">
			<iconify-icon icon="mdi:pen" width="24" class="text-primary-500" />
			<p>Edit</p>
		</div>
	</Tab>
	<!-- Revision -->
	{#if $collection.revision === true}
		<Tab bind:group={tabSet} name="tab2" value={1}>
			<div class="flex items-center gap-1">
				<iconify-icon icon="pepicons-pop:countdown" width="24" class="text-primary-500" />
				<p>Ver. <span class="variant-outline-primary badge rounded-full">1</span></p>
			</div>
		</Tab>
	{/if}
	<!-- Api Json -->
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
			<div class="mb-2 flex items-center justify-between gap-2">
				<p class="text-center text-primary-500">Compare Revision against:</p>
				<button class="variant-ghost-primary btn">Revert</button>
			</div>
			<!-- dropdown -->
			<select class="select mb-2">
				<option value="1">Most recent</option>
				<option value="2">February 19th 2024, 4:00 PM</option>
			</select>

			<div class="flex items-center justify-between dark:text-white">
				<!-- Current version -->
				<div class="text-center">
					Current version
					<code class="code">text here</code>
				</div>
				<div class="inline-block w-0.5 self-stretch bg-neutral-100 opacity-100 dark:opacity-50" />
				<!-- Revision version -->
				<div class="ml-2">
					February 19th 2024, 4:00 PM
					<code class="code">text here</code>
				</div>
			</div>
		{:else if tabSet === 2}
			<!-- API Json -->

			{#if $collectionValue != null}
				<div class="variant-ghost-error mb-4 py-2 text-center font-bold">No Data yet</div>
			{:else}
				<div class="mb-4 flex items-center gap-1">
					<button class="btn"
						>API URL <iconify-icon
							icon="ph:copy"
							use:clipboard={'/api/posts/65d504cbc076935f7f8d8a1b?locale=undefined&draft=true&depth=0'}
						/>:</button
					>
					<code class="code text-wrap">/api/posts/65d504cbc076935f7f8d8a1b?locale=undefined&draft=true&depth=0</code>
				</div>

				<CodeBlock
					color="dark:text-primary-500"
					language="JSON"
					lineNumbers={true}
					text="text-xs w-full"
					buttonLabel="Copy"
					code={JSON.stringify($collectionValue, null, 2)}
				></CodeBlock>
			{/if}
		{/if}
	</svelte:fragment>
</TabGroup>
