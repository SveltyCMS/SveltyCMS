<!--
@file src/widgets/core/group/Group.svelte
@component
**Group widget**

Displays a group of fields, either in a simple grouped layout or within tabs.
-->

<script lang="ts">
	import type { FieldType } from './types';
	import { Tabs } from '@skeletonlabs/skeleton-svelte';

	// Props
	interface Props {
		field: FieldType;
		WidgetData?: Record<string, any>;
	}
	let { field, WidgetData = $bindable({}) }: Props = $props();

	// Dynamic import of widget components
	const modules: Record<string, { default: any }> = import.meta.glob('@widgets/**/*.svelte', { eager: true });

	let activeTab = $state(0);
</script>

<div>
	{#if field.mode === 'tab'}
		<Tabs>
			{#each field.fields as subField, index}
				<Tab bind:group={activeTab} name={subField.label} value={index}>
					<div class="flex items-center gap-1">
						{#if subField.icon}
							<iconify-icon icon={subField.icon} width="24" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
						{/if}
						<p>{subField.label || subField.db_fieldName}</p>
					</div>
				</Tab>
			{/each}

			{#each field.fields as subField, index}
				{#if activeTab === index}
					{@const widgetPath = `/src/widgets/${subField.widget.Name.toLowerCase()}/${subField.widget.Name}.svelte`}
					{@const WidgetComponent = modules[widgetPath]?.default}
					<div class="dark:border-surface-500 dark:bg-surface-900 rounded-md border bg-white px-4 py-6 drop-shadow-2xl">
						{#if WidgetComponent}
							<WidgetComponent field={subField} bind:WidgetData={WidgetData[subField.db_fieldName]} />
						{:else}
							<p>Widget not found: {subField.widget.Name}</p>
						{/if}
					</div>
				{/if}
			{/each}
		</Tabs>
	{:else}
		<div class="mb-4">
			<h3 class="mb-2 text-lg font-bold">{field.label}</h3>
			<div class="flex flex-wrap items-center justify-center gap-1 overflow-auto">
				{#each field.fields as subField}
					{@const widgetPath = `/src/widgets/${subField.widget.Name.toLowerCase()}/${subField.widget.Name}.svelte`}
					{@const WidgetComponent = modules[widgetPath]?.default}
					<div
						class="mx-auto text-center {!subField?.width ? 'w-full ' : 'max-md:w-full!'}"
						style={'min-width:min(300px,100%);' + (subField.width ? `width:calc(${Math.floor(100 / subField?.width)}% - 0.5rem)` : '')}
					>
						<div class="flex justify-between px-[5px] text-start">
							<p class="inline-block font-semibold capitalize">
								{subField.label || subField.db_fieldName}
								{#if subField.required}<span class="text-error-500">*</span>{/if}
							</p>
							{#if subField.icon}
								<iconify-icon icon={subField.icon} color="dark" width="22"> </iconify-icon>
							{/if}
						</div>

						{#if WidgetComponent}
							<WidgetComponent field={subField} bind:WidgetData={WidgetData[subField.db_fieldName]} />
						{:else}
							<p>Widget not found: {subField.widget.Name}</p>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
