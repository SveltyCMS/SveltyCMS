<script lang="ts">
	import { dev } from '$app/environment';
	import { publicEnv } from '@root/config/public';
	import { asAny, getFieldName, pascalToCamelCase } from '@utils/utils';

	// Auth
	const user = $page.data.user;

	// Stores
	import { collectionValue, contentLanguage, collection, entryData, tabSet } from '@stores/store';
	import { page } from '$app/stores';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { TabGroup, Tab, CodeBlock, clipboard } from '@skeletonlabs/skeleton';

	export let fields: typeof $collection.fields | undefined = undefined;
	export let root = true; // if Fields is not part of any widget.
	export let fieldsData = {};
	export let customData = {};

	$: if (root) $collectionValue = fieldsData;

	const modules = import.meta.glob('@src/components/widgets/*/*.svelte');

	let apiUrl = '';

	$: if ($entryData) {
		const id = $entryData._id; // Assuming _id is the property containing the ID
		apiUrl = `${dev ? 'http://localhost:5173' : publicEnv.SITE_NAME}/api/${$collection.name}/${id}`;
	}

	function handleRevert(event: MouseEvent) {
		alert('Function not implemented.');
	}

	function getTabHeaderVisibility() {
		// Hide headers only when non-admin and no revision
		return user.roles != 'admin' && !$collection.revision;
	}
</script>

<TabGroup
	justify=" {$collection.revision === true ? 'justify-between md:justify-around' : 'justify-center '} items-center"
	rounded="rounded-tl-container-token rounded-tr-container-token"
	flex="flex-1 items-center"
	active="border-b border-tertiary-500 dark:order-primary-500 variant-soft-secondary"
	hover="hover:variant-soft-secondary"
	regionList={getTabHeaderVisibility() ? 'hidden' : ''}
>
	<!-- Data -->
	<Tab bind:group={$tabSet} name="tab1" value={0}>
		<div class="flex items-center gap-1">
			<iconify-icon icon="mdi:pen" width="24" class="text-tertiary-500 dark:text-primary-500" />
			<p>{m.fields_edit()}</p>
		</div>
	</Tab>

	<!-- Revision -->
	{#if $collection.revision === true}
		<Tab bind:group={$tabSet} name="tab2" value={1}>
			<div class="flex items-center gap-1">
				<iconify-icon icon="pepicons-pop:countdown" width="24" class="text-tertiary-500 dark:text-primary-500" />
				<p>Ver. <span class="variant-outline-tertiary badge rounded-full dark:variant-outline-primary">1</span></p>
			</div>
		</Tab>
	{/if}

	<!-- API JSON -->
	{#if user.roles == 'admin'}
		<Tab bind:group={$tabSet} name="tab3" value={2}>
			<div class="flex items-center gap-1">
				<iconify-icon icon="ant-design:api-outlined" width="24" class="text-tertiary-500 dark:text-primary-500" />
				<p>API</p>
			</div>
		</Tab>
	{/if}

	<!-- Tab Panels --->
	<svelte:fragment slot="panel">
		<!-- Data -->
		{#if $tabSet === 0}
			<div class="mb-2 text-center text-xs text-error-500">{m.fields_required()}</div>
			<div class="wrapper">
				<div class="flex flex-wrap items-center justify-center gap-1 overflow-auto">
					{#each (fields || $collection.fields).filter((f) => f?.permissions?.[user.role]?.read !== false) as field}
						{#if field.widget}
							{#key $collection}
								<div
									class="mx-auto text-center {!field?.width ? 'w-full ' : 'max-md:!w-full'}"
									style={'min-width:min(300px,100%);' + (field.width ? `width:calc(${Math.floor(100 / field?.width)}% - 0.5rem)` : '')}
								>
									<!-- Widget label -->
									<div class="flex justify-between px-[5px] text-start">
										<!-- db_fieldName or label  -->
										<p class="inline-block font-semibold capitalize">
											{#if field.label}
												{field.label}
											{:else}
												{field.db_fieldName}
											{/if}

											<!-- TODO: fix required -->
											{#if field.required == true}
												<span class="text-error-500">*</span>
											{/if}
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
									{#await modules[`/src/components/widgets/${pascalToCamelCase(field.widget.Name)}/${field.widget.Name}.svelte`]() then widget}
										<svelte:component
											this={asAny(widget).default}
											field={asAny(field)}
											bind:WidgetData={fieldsData[getFieldName(field)]}
											value={customData[getFieldName(field)]}
											{...$$props}
										/>
									{/await}
								</div>
							{/key}
						{/if}
					{/each}
				</div>
			</div>
		{:else if $tabSet === 1}
			<!-- Revision -->
			<div class="mb-2 flex items-center justify-between gap-2">
				<p class="text-center text-tertiary-500 dark:text-primary-500">{m.fields_revision_compare()}</p>
				<button class="variant-outline-tertiary btn dark:variant-ghost-primary" on:click={handleRevert}>{m.fields_revision_revert()}</button>
			</div>
			<!-- Dropdown -->
			<select class="select mb-2">
				<option value="1">{m.fields_revision_most_recent()}</option>
				<option value="2">February 19th 2024, 4:00 PM</option>
			</select>

			<div class="flex justify-between dark:text-white">
				<!-- Current version -->
				<div class="w-full text-center">
					<p class="mb-4 sm:mb-0">{m.fields_revision_current_version()}</p>
					<CodeBlock
						color="text-white dark:text-primary-500"
						language="JSON"
						rounded="rounded-container-token"
						lineNumbers={true}
						text="text-xs text-left w-full"
						buttonLabel=""
						code={JSON.stringify($entryData, null, 2)}
					/>
				</div>
				<div
					class="ml-1 min-h-[1em] w-px self-stretch bg-gradient-to-tr from-transparent via-neutral-500 to-transparent opacity-20 dark:opacity-100"
				></div>
				<!-- Revision version -->
				<div class="ml-1 w-full text-left">
					<p class="text-center text-tertiary-500">February 19th 2024, 4:00 PM</p>
					<!-- <HighlightedText text={JSON.stringify($entryData, null, 2)} term="bg-red-100" /> -->
					<CodeBlock
						color="text-white dark:text-primary-500"
						language="JSON"
						lineNumbers={true}
						text="text-xs text-left text-white dark:text-tertiary-500"
						buttonLabel=""
						code={JSON.stringify($entryData, null, 2)}
					/>
				</div>
			</div>
		{:else if $tabSet === 2}
			<!-- API Json -->
			{#if $entryData == null}
				<div class="variant-ghost-error mb-4 py-2 text-center font-bold">{m.fields_api_nodata()}</div>
			{:else}
				<div class="wrapper relative z-0 mb-4 flex w-full items-center justify-start gap-1">
					<!-- label -->
					<p class="flex items-center">
						<span class="mr-1">API URL:</span>
						<iconify-icon icon="ph:copy" use:clipboard={apiUrl} class="pb-6 text-tertiary-500 dark:text-primary-500" />
					</p>
					<!-- Url -->
					<button class="btn text-wrap text-left" on:click={() => window.open(apiUrl, '_blank')} title={apiUrl}>
						<span class="text-wrap text-tertiary-500 dark:text-primary-500">{apiUrl}</span>
					</button>
				</div>

				<CodeBlock
					color="text-white dark:text-primary-500"
					language="JSON"
					lineNumbers={true}
					text="text-xs w-full"
					buttonLabel="Copy"
					code={JSON.stringify($entryData, null, 2)}
				></CodeBlock>
			{/if}
		{/if}
	</svelte:fragment>
</TabGroup>
