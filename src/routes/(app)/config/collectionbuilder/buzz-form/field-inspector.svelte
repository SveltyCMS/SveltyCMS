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
	import { collections, setCollection } from '@src/stores/collection-store.svelte';
	import { widgets } from '@src/stores/widget-store.svelte.ts';
	import { asAny } from '@utils/utils';
	import type { Component } from 'svelte';
	import { Tabs } from '@skeletonlabs/skeleton-svelte';
	import InputSwitch from '@src/components/system/builder/input-switch.svelte';
	import Specific from '../[action]/[...contentPath]/tabs/collection-widget/tabs-fields/specific.svelte';
	import Permission from '../[action]/[...contentPath]/tabs/collection-widget/tabs-fields/permission.svelte';

	interface Props {
		onDelete: () => void;
	}
	const { onDelete }: Props = $props();

	let activeTab = $state('general');

	const target = $derived(collections.targetWidget) as any;
	const availableWidgets = $derived(widgets.widgetFunctions || {});
	// Resolve widget by key or Name (store registers by fn.Name e.g. "Relation")
	const widgetKey = $derived(target?.widget?.key || target?.widget?.Name || '');
	const guiSchema = $derived.by(() => {
		const w = availableWidgets as Record<string, { GuiSchema?: Record<string, { widget: Component<any> }> }>;
		const byKey = w[widgetKey]?.GuiSchema;
		if (byKey) return byKey as Record<string, { widget: Component<any> }>;
		// Fallback: match by lowercase (store may use different casing)
		const lower = widgetKey?.toLowerCase?.() ?? '';
		const key = Object.keys(w).find((k) => k.toLowerCase() === lower);
		return (key ? w[key]?.GuiSchema : null) || ({} as Record<string, { widget: Component<any> }>);
	});

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

	function handleUpdate(detail: { value?: any; icon?: any }, property: string) {
		const active = collections.active;
		const target = collections.targetWidget as (Record<string, unknown> & { __fieldIndex?: number }) | undefined;
		if (!active || !target) return;

		// IconifyIconsPicker updates bind:icon (not value); for property 'icon' prefer detail.icon so selection is saved and displayed.
		const value = property === 'icon' ? (detail.icon ?? detail.value) : (detail.value ?? detail.icon);
		const fields = (Array.isArray(active.fields) ? [...active.fields] : []) as Record<string, unknown>[];
		let idx: number;

		if (typeof target.__fieldIndex === 'number' && target.__fieldIndex >= 0 && target.__fieldIndex < fields.length) {
			idx = target.__fieldIndex;
		} else {
			const norm = (s: unknown) =>
				String(s ?? '')
					.trim()
					.toLowerCase();
			const targetDbName = norm(target.db_fieldName);
			const targetId = target.id;
			const targetLabel = norm(target.label);
			idx = fields.findIndex((f: Record<string, unknown>) => {
				if (targetId != null && (f.id === targetId || f.id == targetId)) return true;
				if (targetDbName && norm(f.db_fieldName) === targetDbName) return true;
				if (targetLabel && norm(f.label) === targetLabel) return true;
				return false;
			});
		}

		if (idx === -1) {
			// Fallback: update store by matching field (id or db_fieldName) so Save still persists the edit
			const norm = (s: unknown) =>
				String(s ?? '')
					.trim()
					.toLowerCase();
			const targetId = target.id;
			const targetDb = norm(target.db_fieldName);
			const mappedFields = fields.map((f: Record<string, unknown>) => {
				const match = (targetId != null && (f.id === targetId || f.id == targetId)) || (targetDb && norm(f.db_fieldName) === targetDb);
				return match ? { ...f, [property]: value } : f;
			});
			if (mappedFields.some((f: Record<string, unknown>, i: number) => fields[i] !== f)) {
				setCollection({ ...active, fields: mappedFields } as any);
			}
			collections.setTargetWidget({ ...target, [property]: value } as any);
			return;
		}

		const updatedField = { ...fields[idx], [property]: value } as Record<string, unknown>;
		const newFields = fields.slice(0, idx).concat(updatedField, fields.slice(idx + 1));
		setCollection({ ...active, fields: newFields } as any);
		const forTarget =
			typeof (target as any).__fieldIndex === 'number' ? { ...updatedField, __fieldIndex: (target as any).__fieldIndex } : updatedField;
		collections.setTargetWidget(forTarget as any);
	}
</script>

<div class="flex h-full min-w-0 flex-col border-l border-surface-200-800 bg-surface-50-950 w-full min-w-[280px] max-w-[95vw] lg:w-80">
	{#if !target || !target.widget}
		<div class="flex h-full flex-col items-center justify-center p-8 text-center text-surface-500">
			<iconify-icon icon="mdi:form-select" width="48" class="mb-4 opacity-20"></iconify-icon>
			<p class="text-sm font-medium">No field selected</p>
			<p class="mt-1 text-xs opacity-60">Select a field on the canvas to configure its properties</p>
		</div>
	{:else}
		<!-- Header: sticky so delete stays visible when content scrolls; grid keeps delete always on-screen -->
		<div class="sticky top-0 z-10 shrink-0 border-b border-surface-200-800 bg-surface-50-950 p-3 shadow-sm sm:p-4 dark:bg-surface-900">
			<div class="grid grid-cols-[auto_1fr_auto] items-center gap-2 sm:gap-3">
				<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-500 text-white shadow-sm sm:h-10 sm:w-10">
					<iconify-icon icon={target.icon || 'mdi:widgets'} width="24"></iconify-icon>
				</div>
				<div class="min-w-0 overflow-hidden">
					<h3 class="truncate font-bold text-sm sm:text-base">{target.label || 'Configure Field'}</h3>
					<p class="truncate text-[10px] uppercase tracking-wider text-surface-500">{target.widget?.key || target.widget?.Name}</p>
				</div>
				<button onclick={onDelete} class="btn-icon btn-icon-sm preset-ghost-error-500 shrink-0" title="Delete Field" aria-label="Delete field">
					<iconify-icon icon="mdi:trash-can" width="18"></iconify-icon>
				</button>
			</div>
		</div>

		<!-- Tabs: tab list fixed; content area scrolls so all settings are visible -->
		<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
			<Tabs value={activeTab} onValueChange={(e: { value: string }) => (activeTab = e.value)} class="flex min-h-0 flex-1 flex-col overflow-hidden">
				<div class="shrink-0 overflow-x-auto border-b border-surface-200-800 tab-list-scroll">
					<Tabs.List class="flex w-max min-w-full flex-nowrap border-none px-1 py-0 sm:px-2">
						<Tabs.Trigger value="general" class="shrink-0 px-2 py-2 text-xs font-bold uppercase tracking-wider sm:px-3">Basic</Tabs.Trigger>
						<Tabs.Trigger
							value="specific"
							class="shrink-0 px-2 py-2 text-xs font-bold uppercase tracking-wider sm:px-3"
							disabled={specificProperties.length === 0}
						>
							Settings
						</Tabs.Trigger>
						<Tabs.Trigger value="auth" class="shrink-0 px-2 py-2 text-xs font-bold uppercase tracking-wider sm:px-3">Auth</Tabs.Trigger>
					</Tabs.List>
				</div>

				<div class="min-h-0 flex-1 overflow-y-auto p-4">
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
							{#if displayProperties.length > 0 && displayProperties.every((p) => !guiSchema[p])}
								<p class="text-sm text-surface-500">No basic options for this widget. Ensure widgets are loaded (Field Configuration tab).</p>
							{/if}
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
	.tab-list-scroll {
		scrollbar-width: thin;
	}
	.tab-list-scroll::-webkit-scrollbar {
		height: 4px;
	}
	.tab-list-scroll::-webkit-scrollbar-thumb {
		background: rgba(var(--color-surface-500), 0.25);
		border-radius: 2px;
	}
</style>
