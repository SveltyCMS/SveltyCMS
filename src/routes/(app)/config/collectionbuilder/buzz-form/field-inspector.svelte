<!-- 
@files src/routes/(app)/config/collectionbuilder/BuzzForm/FieldInspector.svelte
@component
**Field Inspector**

### Props
- `onDelete` {Function} - Callback function to handle field deletion
- `onUpdate` {Function} - Callback function to handle field updates
- `onSelectField` {Function} - Callback function to handle field selection

### Features:
- Basic Field Configuration
- Field Permissions
- Field Specific Settings

-->

<script lang="ts">
	import { collections } from '@src/stores/collection-store.svelte';
	import { widgets } from '@src/stores/widget-store.svelte.ts';
	import { asAny } from '@utils/utils';
	import type { Component } from 'svelte';

	interface Props {
		onDelete: () => void;
	}
	const { onDelete }: Props = $props();

	let activeTab = $state('general');

	const target = $derived(collections.targetWidget) as any;
	const widgetKey = $derived(target?.widget?.key || target?.widget?.Name?.toLowerCase() || '');
	const availableWidgets = $derived(widgets.widgetFunctions || {});
	const guiSchema = $derived((asAny<any>(availableWidgets)[widgetKey]?.GuiSchema || {}) as Record<string, { widget: Component<any> }>);

	const allProperties = $derived(Object.keys(guiSchema || {}));
	const standardProperties = ['label', 'db_fieldName', 'required', 'translated', 'icon', 'helper', 'width'];
	const displayProperties = $derived([...standardProperties]);
	const specificProperties = $derived(allProperties.filter((prop) => !standardProperties.includes(prop) && prop !== 'permissions'));

	function defaultValue(property: string) {
		if (property === 'required' || property === 'translated') {
			return false;
		}
		return (target.widget as any)?.Name;
	}

	function handleUpdate(detail: { value: any }, property: string) {
		const current = collections.targetWidget;
		current[property] = detail.value;
		collections.setTargetWidget(current);
	}
</script>

<div class="flex h-full flex-col border-l border-surface-200-800 bg-surface-50-950 w-80">
	{#if !target || !target.widget}
		<div class="flex h-full flex-col items-center justify-center p-8 text-center text-surface-500">
			<iconify-icon icon="mdi:form-select" width="48" class="mb-4 opacity-20"></iconify-icon>
			<p class="text-sm font-medium">No field selected</p>
			<p class="mt-1 text-xs opacity-60">Select a field on the canvas to configure its properties</p>
		</div>
	{:else}
		<!-- Header -->
		<div class="border-b border-surface-200-800 p-4">
			<div class="flex items-center gap-3">
				<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-500 text-white shadow-sm">
					<iconify-icon icon={target.icon || 'mdi:widgets'} width="24"></iconify-icon>
				</div>
				<div class="flex-1 overflow-hidden">
					<h3 class="truncate font-bold">{target.label || 'Configure Field'}</h3>
					<p class="truncate text-[10px] uppercase tracking-wider text-surface-500">{target.widget?.key || target.widget?.Name}</p>
				</div>
				<button onclick={onDelete} class="btn-icon btn-icon-sm preset-ghost-error-500" title="Delete Field">
					<iconify-icon icon="mdi:trash-can" width="18"></iconify-icon>
				</button>
			</div>
		</div>

		<!-- Tabs -->
		<div class="flex-1 overflow-hidden flex flex-col">
			<Tabs value={activeTab} onValueChange={(e) => (activeTab = e.value as string)} class="flex flex-col h-full">
				<Tabs.List class="flex border-b border-surface-200-800 px-2 justify-between">
					<Tabs.Trigger value="general" class="px-3 py-2 text-xs font-bold uppercase tracking-wider">Basic</Tabs.Trigger>
					<Tabs.Trigger value="specific" class="px-3 py-2 text-xs font-bold uppercase tracking-wider" disabled={specificProperties.length === 0}>
						Settings
					</Tabs.Trigger>
					<Tabs.Trigger value="auth" class="px-3 py-2 text-xs font-bold uppercase tracking-wider">Auth</Tabs.Trigger>
				</Tabs.List>

				<div class="flex-1 overflow-y-auto p-4 custom-scrollbar">
					<Tabs.Content value="general">
						<div class="space-y-6">
							{#each displayProperties as property (property)}
								{#if guiSchema[property]}
									<div class="space-y-1">
										<InputSwitch
											value={target[property] ?? defaultValue(property)}
											icon={target[property] as string}
											widget={asAny(guiSchema[property]?.widget)}
											key={property}
											onupdate={(e: { value: any }) => handleUpdate(e, property)}
										/>
									</div>
								{/if}
							{/each}
						</div>
					</Tabs.Content>

					<Tabs.Content value="specific"><Specific /></Tabs.Content>

					<Tabs.Content value="auth"><Permission /></Tabs.Content>
				</div>
			</Tabs>
		</div>
	{/if}
</div>

<style>
	.custom-scrollbar::-webkit-scrollbar {
		width: 4px;
	}
	.custom-scrollbar::-webkit-scrollbar-track {
		background: transparent;
	}
	.custom-scrollbar::-webkit-scrollbar-thumb {
		background: rgba(var(--color-surface-500), 0.2);
		border-radius: 2px;
	}
</style>
