<!--
@file src/widgets/core/Repeater/Input.svelte
@component
**Repeater Input Component**

Renders a list of forms, one for each item in the array. Supports Drag-and-Drop reordering.

@features
- **Accessible DnD**: Uses `svelte-dnd-action` for keyboard and mouse reordering.
- **Dynamic Fields**: Renders nested widgets for each item.
- **Collapsible Items**: items can be collapsed to save space.
-->

<script lang="ts">
	import WidgetLoader from '@src/components/collection-display/widget-loader.svelte';
	import { widgets } from '@src/stores/widget-store.svelte';
	import { getFieldName } from '@utils/utils';
	import { flip } from 'svelte/animate';
	import type { DndEvent } from 'svelte-dnd-action';
	import { dndzone } from 'svelte-dnd-action';
	import { v4 as uuidv4 } from 'uuid'; // Ensure uuid is available, or use a simple generator
	import type { FieldType } from './index';

	interface Props {
		collectionName?: string;
		field: FieldType;
		tenantId?: string;
		value: Record<string, any>[] | null | undefined;
	}

	let { field, value = $bindable([]), tenantId, collectionName }: Props = $props();

	// Ensure value is an array and handle null/undefined safely
	$effect(() => {
		if (value === null || value === undefined || !Array.isArray(value)) {
			value = [];
		}
	});

	// --- WIDGET LOADING LOGIC ---
	const modules: Record<string, () => Promise<{ default: any }>> = import.meta.glob('/src/widgets/**/*.svelte') as Record<
		string,
		() => Promise<{ default: any }>
	>;

	function getWidgetLoader(widgetName: string) {
		if (!widgetName) return null;

		// 1. Exact match via store
		const fn = widgets.widgetFunctions[widgetName];
		const storePath = (fn as any)?.componentPath || (fn as any)?.inputComponentPath;
		if (storePath && storePath in modules) {
			return modules[storePath];
		}

		// 2. Normalized casing and common path search
		const normalized = widgetName.toLowerCase();
		for (const path in modules) {
			const lowerPath = path.toLowerCase();
			if (
				lowerPath.includes(`/widgets/core/${normalized}/input.svelte`) ||
				lowerPath.includes(`/widgets/core/${normalized}/index.svelte`) ||
				lowerPath.includes(`/widgets/custom/${normalized}/input.svelte`) ||
				lowerPath.includes(`/widgets/custom/${normalized}/index.svelte`)
			) {
				return modules[path];
			}
		}

		// 3. Last resort fallback
		for (const path in modules) {
			if (path.toLowerCase().includes(`/${normalized}/input.svelte`)) {
				return modules[path];
			}
		}

		return null;
	}
	// -----------------------------------------------------------

	// --- DnD Logic ---
	let items = $state<{ id: string; data: Record<string, any> }[]>([]);

	// Sync value to items
	$effect(() => {
		const safeValue = value || [];
		if (safeValue.length !== items.length) {
			items = safeValue.map((item) => ({
				id: (item._dndId as string) || uuidv4(),
				data: item
			}));
		}
	});

	// Sync items back to value
	function updateValue() {
		if (!value) return;
		value = items.map((i) => i.data);
	}

	function handleDndConsider(e: CustomEvent<DndEvent<{ id: string; data: any }>>) {
		items = e.detail.items;
	}

	function handleDndFinalize(e: CustomEvent<DndEvent<{ id: string; data: any }>>) {
		items = e.detail.items;
		updateValue();
	}

	function addItem() {
		const newItemId = uuidv4();
		const newItemData: Record<string, any> = { _dndId: newItemId };

		// Initialize fields with defaults if possible
		if ((field as any).fields) {
			(field as any).fields.forEach((f: any) => {
				const name = f.db_fieldName || getFieldName(f);
				newItemData[name] = f.default !== undefined ? f.default : null;
			});
		}

		items = [...items, { id: newItemId, data: newItemData }];
		updateValue();
	}

	function removeItem(id: string) {
		items = items.filter((i) => i.id !== id);
		updateValue();
	}

	// Helper specific to formatting labels for collapsed items (e.g. show first field)
	function getItemLabel(itemData: Record<string, any>, index: number) {
		const fields = (field as any).fields;
		if (fields && fields.length > 0) {
			// Try to find a title/name field
			const titleField = fields.find((f: any) => f.label.toLowerCase().includes('title') || f.label.toLowerCase().includes('name'));
			const fieldName = titleField ? titleField.db_fieldName || getFieldName(titleField) : fields[0].db_fieldName || getFieldName(fields[0]);
			const val = itemData[fieldName];
			if (val && typeof val === 'string') {
				return val;
			}
		}
		return `Item ${index + 1}`;
	}

	let collapsedItems = $state<Record<string, boolean>>({});

	function toggleCollapse(id: string) {
		collapsedItems[id] = !collapsedItems[id];
	}
</script>

<div class="w-full space-y-2">
	<div
		use:dndzone={{ items, flipDurationMs: 300, dropTargetStyle: { outline: '2px solid var(--color-primary-500)', 'border-radius': '0.5rem' } }}
		onconsider={handleDndConsider}
		onfinalize={handleDndFinalize}
		class="flex flex-col gap-2"
	>
		{#each items as item, index (item.id)}
			<div
				class="rounded-container-token border border-surface-200 bg-surface-50 dark:border-surface-700 dark:bg-surface-800"
				animate:flip={{ duration: 300 }}
			>
				<!-- Header / Handle -->
				<header class="flex items-center justify-between border-b border-surface-200 p-2 dark:border-surface-700">
					<div class="flex items-center gap-2">
						<!-- Drag Handle -->
						<button
							class="cursor-grab active:cursor-grabbing p-1 text-surface-400 hover:text-primary-500"
							aria-label="Drag to reorder"
							title="Drag to reorder"
						>
							<iconify-icon icon="mdi:drag" width="20"></iconify-icon>
						</button>

						<button onclick={() => toggleCollapse(item.id)} class="flex items-center gap-2 text-sm font-semibold">
							<iconify-icon icon={collapsedItems[item.id] ? 'mdi:chevron-right' : 'mdi:chevron-down'} width="16"></iconify-icon>
							{getItemLabel(item.data, index)}
						</button>
					</div>

					<button onclick={() => removeItem(item.id)} class="text-error-500 hover:text-error-600 p-1" aria-label="Remove Item" title="Remove Item">
						<iconify-icon icon="mdi:delete" width="18"></iconify-icon>
					</button>
				</header>

				<!-- Body -->
				{#if !collapsedItems[item.id]}
					<div class="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
						{#if (field as any).fields}
							{#each (field as any).fields as subField}
								{@const subFieldName = subField.db_fieldName || getFieldName(subField)}
								{@const widgetName = subField.widget?.Name || subField.type || 'Input'}
								{@const widgetLoader = getWidgetLoader(widgetName)}

								<div class="col-span-1 {(subField as any).width ? `lg:col-span-${(subField as any).width}` : ''} w-full">
									{#if widgetLoader}
										<!-- Bind to item.data[subFieldName] directly? item.data is reactive? Svelte 5 state needed? -->
										<!-- items is $state, so items[index].data is reactive -->
										<WidgetLoader loader={widgetLoader} field={subField} bind:value={item.data[subFieldName]} {tenantId} {collectionName} />
									{:else}
										<div class="text-error-500 text-xs">Widget {widgetName} not found</div>
									{/if}
								</div>
							{/each}
						{/if}
					</div>
				{/if}
			</div>
		{/each}
	</div>

	<button onclick={addItem} class="btn variant-filled-primary w-full sm:w-auto">
		<iconify-icon icon="mdi:plus" width="18"></iconify-icon>
		<span>{(field as any).addLabel || 'Add Item'}</span>
	</button>
</div>
