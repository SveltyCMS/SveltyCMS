<script lang="ts">
	import { dev } from '$app/environment';
	import { publicEnv } from '@root/config/public';
	import { asAny, getFieldName } from '@utils/utils';

	// Skeleton
	import { TabGroup, Tab, CodeBlock, clipboard } from '@skeletonlabs/skeleton';

	export let fields: typeof $collection.fields | undefined = undefined;
	export let root = true; // if Fields is not part of any widget.
	export let fieldsData = {};
	export let customData = {};

	$: if (root) $collectionValue = fieldsData;

	// Stores
	import { collectionValue, contentLanguage, collection, entryData, tabSet, translationStatus, completionStatus } from '@stores/store';

	console.log('translationStatus', $translationStatus);
	console.log('completionStatus', $completionStatus);
	console.log('entryData', $entryData);
	console.log('fields', $collection.fields);
	console.log('contentLanguage', $contentLanguage);
	console.log('AVAILABLE_CONTENT_LANGUAGES', publicEnv.AVAILABLE_CONTENT_LANGUAGES);

	// Reactive statement to calculate translation and completion content status
	$: {
		let totalFields = 0;
		let translations = {};

		if ($collection.fields) {
			$collection.fields.forEach((field) => {
				if (field.translated) {
					totalFields++;
					publicEnv.AVAILABLE_CONTENT_LANGUAGES.forEach((lang) => {
						if ($entryData[field.label] && $entryData[field.label][lang] && $entryData[field.label][lang].trim() !== '') {
							// Increase translation count for the language
							translations[lang] = (translations[lang] || 0) + 1;
						}
					});
				}
			});

			// Calculate the translation status for each language
			let translationStatusValue = {};
			publicEnv.AVAILABLE_CONTENT_LANGUAGES.forEach((lang) => {
				// Calculate the translation status as the ratio of translated fields to total fields, capped at 100
				let translationPercentage = translations[lang] ? Math.min((translations[lang] / totalFields) * 100, 100) : 0;
				translationStatusValue[lang] = Math.round(translationPercentage);
			});

			// Update the store value with the translation status
			translationStatus.set(translationStatusValue);

			// Calculate completionStatus based on minimum translationStatus
			let overallCompletionPercentage = Math.min(...Object.values($translationStatus));
			$completionStatus = overallCompletionPercentage;
		}
	}

	// Debugging logs
	$: console.log('completionStatus', $completionStatus);
	$: console.log('translationStatus', $translationStatus);

	let apiUrl = '';

	$: if ($entryData) {
		const id = $entryData._id; // Assuming _id is the property containing the ID
		apiUrl = `${dev ? 'http://localhost:5173' : publicEnv.SITE_NAME}/api/${$collection.name}/${id}`;
	}

	function handleRevert(event: MouseEvent) {
		alert('Function not implemented.');
	}
</script>

<TabGroup
	justify=" {$collection.revision === true ? 'justify-between' : 'justify-center '} items-center"
	rounded="rounded-tl-container-token rounded-tr-container-token"
	flex="flex-1 items-center"
	active="border-b border-tertiary-500 dark:order-primary-500 variant-soft-secondary"
	hover="hover:variant-soft-secondary"
>
	<!-- Data -->
	<Tab bind:group={$tabSet} name="tab1" value={0}>
		<div class="flex items-center gap-1">
			<iconify-icon icon="mdi:pen" width="24" class="text-tertiary-500 dark:text-primary-500" />
			<p>Edit</p>
		</div>
	</Tab>

	<!-- Revision -->
	{#if $collection.revision === true}
		<Tab bind:group={$tabSet} name="tab2" value={1}>
			<div class="flex items-center gap-1">
				<iconify-icon icon="pepicons-pop:countdown" width="24" class="text-tertiary-500 dark:text-primary-500" />
				<p>Ver. <span class="variant-outline-primary badge rounded-full">1</span></p>
			</div>
		</Tab>
	{/if}

	<!-- API Json -->
	<Tab bind:group={$tabSet} name="tab3" value={2}>
		<div class="flex items-center gap-1">
			<iconify-icon icon="ant-design:api-outlined" width="24" class="text-tertiary-500 dark:text-primary-500" />
			<p>API</p>
		</div>
	</Tab>

	<!-- Tab Panels --->
	<svelte:fragment slot="panel">
		<!-- Data -->
		{#if $tabSet === 0}
			<div class="mb-2 text-center text-xs text-error-500">* Required</div>
			<div class="wrapper">
				<div class="flex flex-wrap items-center justify-center gap-1 overflow-auto">
					{#each fields || $collection.fields as field}
						{#if field.widget}
							{#key $collection}
								<div
									class="mx-auto text-center {!field?.width ? 'w-full ' : 'max-md:!w-full'}"
									style={'min-width:min(300px,100%);' + (field?.width ? `width:calc(${Math.floor(100 / field?.width)}% - 0.5rem)` : '')}
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
			</div>
		{:else if $tabSet === 1}
			<!-- Revision -->
			<div class="mb-2 flex items-center justify-between gap-2">
				<p class="text-center text-primary-500">Compare Revision against:</p>
				<button class="variant-ghost-primary btn" on:click={handleRevert}>Revert</button>
			</div>
			<!-- dropdown -->
			<select class="select mb-2">
				<option value="1">Most recent</option>
				<option value="2">February 19th 2024, 4:00 PM</option>
			</select>

			<div class="flex justify-between dark:text-white">
				<!-- Current version -->
				<div class="text-center">
					<p class="mb-4 sm:mb-0">Current version</p>
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
					class=" min-h-[1em] w-px self-stretch bg-gradient-to-tr from-transparent via-neutral-500 to-transparent opacity-20 dark:opacity-100"
				></div>
				<!-- Revision version -->
				<div class="ml-2 text-left">
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
				<div class="variant-ghost-error mb-4 py-2 text-center font-bold">No Data yet</div>
			{:else}
				<div class="wrapper mb-4 flex w-full items-center justify-start gap-1">
					<!-- label -->
					<p class="flex items-center">
						<span class="mr-1">API URL:</span>
						<iconify-icon icon="ph:copy" use:clipboard={apiUrl} class="pb-6 text-primary-500" />
					</p>
					<!-- Url -->
					<button class="btn text-wrap text-left" on:click={() => window.open(apiUrl, '_blank')} title={apiUrl}>
						<span class="code">{apiUrl}</span>
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
