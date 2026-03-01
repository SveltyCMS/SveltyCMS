<!--
@file src/widgets/core/Group/Input.svelte
@component
**Group Widget Input Component**

Renders a group of fields, allowing for nested data structures.

@example
<GroupInput {field} bind:value={groupData} />

#### Props
- `field: FieldType` - The group field configuration (must contain `fields` array)
- `value: GroupWidgetData | null | undefined` - The group data object
-->

<script lang="ts">
	import WidgetLoader from '@src/components/collection-display/widget-loader.svelte';
	import { widgets } from '@src/stores/widget-store.svelte';
	import { getFieldName } from '@utils/utils';
	import type { FieldType } from './';

	interface Props {
		collectionName?: string;
		field: FieldType;
		tenantId?: string;
		value: Record<string, any> | null | undefined;
	}

	let { field, value = $bindable({}), tenantId, collectionName }: Props = $props();

	// Ensure value is an object
	$effect(() => {
		if (!value || typeof value !== 'object') {
			value = {};
		}
	});

	const fieldName = $derived(getFieldName(field));
	const normalizeFieldName = (f: any) => f.db_fieldName || getFieldName(f, true);

	// --- WIDGET LOADING LOGIC ---
	// Locally import modules to allow independent widget loading
	const modules: Record<string, () => Promise<{ default: any }>> = import.meta.glob('../../**/*.svelte') as Record<
		string,
		() => Promise<{ default: any }>
	>;

	function getWidgetLoader(widgetName: string) {
		if (!widgetName) {
			return null;
		}

		// 1. Try exact path from widget store
		const fn = widgets.widgetFunctions[widgetName];
		const storePath = (fn as any)?.componentPath || (fn as any)?.inputComponentPath;
		if (storePath && storePath in modules) {
			return modules[storePath];
		}

		// 2. Try casing variations
		const camelFn = widgets.widgetFunctions[widgetName.charAt(0).toLowerCase() + widgetName.slice(1)];
		const camelPath = (camelFn as any)?.componentPath || (camelFn as any)?.inputComponentPath;
		if (camelPath && camelPath in modules) {
			return modules[camelPath];
		}

		const lowerFn = widgets.widgetFunctions[widgetName.toLowerCase()];
		const lowerPath = (lowerFn as any)?.componentPath || (lowerFn as any)?.inputComponentPath;
		if (lowerPath && lowerPath in modules) {
			return modules[lowerPath];
		}

		// 3. Fallback search
		const normalized = widgetName.toLowerCase();
		for (const path in modules) {
			if (Object.hasOwn(modules, path)) {
				const lowerPath = path.toLowerCase();
				const parts = lowerPath.split('/');
				const fileName = parts.pop();
				const folderName = parts.pop();

				if (folderName === normalized && fileName === 'input.svelte') {
					return modules[path];
				}
				if (folderName === normalized && fileName === 'index.svelte') {
					return modules[path];
				}
				if (fileName === `${normalized}.svelte` && normalized !== 'input') {
					return modules[path];
				}
			}
		}
		return null;
	}

	// Variant classes (matching Display.svelte for consistency)
	const variantClasses = {
		default: {
			container: '',
			header: 'border-b border-gray-200 bg-transparent dark:border-gray-700',
			content: 'bg-transparent pt-3'
		},
		card: {
			container: 'rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800',
			header: 'rounded-t-lg border-b border-gray-200 bg-gray-50 dark:border-gray-600 dark:bg-gray-700',
			content: 'p-4'
		},
		bordered: {
			container: 'rounded-lg border border-gray-300 dark:border-gray-600',
			header: 'rounded-t-lg border-b border-gray-300 bg-gray-100 dark:border-gray-600 dark:bg-gray-700',
			content: 'rounded-b-lg bg-white p-4 dark:bg-gray-800'
		}
	};

	const variant = $derived(variantClasses[(field as any).variant as keyof typeof variantClasses] || variantClasses.default);

	// Collapsible state with manual override
	let manualCollapsed = $state<boolean | null>(null);
	let isCollapsed = $derived(manualCollapsed ?? (field as any).collapsed ?? false);

	function toggleCollapse() {
		if ((field as any).collapsible) {
			manualCollapsed = !isCollapsed;
		}
	}
</script>

<div class="mb-4 w-full {variant.container}">
	<!-- Header -->
	{#if (field as any).groupTitle || (field as any).collapsible}
		<button
			type="button"
			onclick={toggleCollapse}
			disabled={!(field as any).collapsible}
			aria-expanded={!isCollapsed}
			aria-controls="{fieldName}-content"
			class="flex w-full items-center justify-between p-3 {variant.header} {(field as any).collapsible
				? 'cursor-pointer hover:bg-black/5 dark:hover:bg-white/5'
				: ''}"
		>
			<h4 class="text-base font-semibold">{(field as any).groupTitle || field.label}</h4>
			{#if (field as any).collapsible}
				<iconify-icon icon="mdi:chevron-down" width="20" class="transition-transform duration-200 {isCollapsed ? 'rotate-180' : ''}"></iconify-icon>
			{/if}
		</button>
	{/if}

	<!-- Content -->
	<div id="{fieldName}-content" class="{variant.content} transition-all duration-200 {isCollapsed ? 'hidden' : 'block'}">
		{#if (field as any).fields && (field as any).fields.length > 0}
			<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
				{#each (field as any).fields as subField, index (subField.db_fieldName || subField.name || index)}
					{@const subFieldName = normalizeFieldName(subField)}
					{@const widgetName = (subField as any).widget?.Name || (subField as any).type || 'Input'}
					{@const widgetLoader = getWidgetLoader(widgetName)}

					<div class="col-span-1 {(subField as any).width ? `lg:col-span-${(subField as any).width}` : ''} w-full">
						{#if widgetLoader && value}
							<WidgetLoader loader={widgetLoader} field={subField as any} bind:value={value[subFieldName]} {tenantId} {collectionName} />
						{:else if !value}
							<p class="text-error-500">Group value is missing</p>
						{:else}
							<div class="rounded border border-error-500 p-2 text-error-500">Widget not found: {widgetName}</div>
						{/if}
					</div>
				{/each}
			</div>
		{:else}
			<p class="text-sm italic text-gray-500">No fields defined in this group.</p>
		{/if}
	</div>
</div>
