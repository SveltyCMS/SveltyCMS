<!--
@file src/widgets/core/Group/Display.svelte
@component
**Group Widget Display Component**

Renders grouped content in a read-only display format with collapsible functionality.

@example
<GroupDisplay {field} {value} {children} />

#### Props
- `field: FieldType` - The group field configuration
- `value: GroupWidgetData | null | undefined` - The group data
- `children?: any` - Rendered child widgets to display

#### Features
- Visual grouping with clean separation
- Collapsible display functionality
- Multiple styling presets (default, card, bordered)
- Responsive design
- Accessible with ARIA attributes
- Keyboard navigation support
- Nested content support
-->

<script lang="ts">
	import { getFieldName } from '@src/utils/utils';
	import type { FieldType, GroupWidgetData } from './';

	interface Props {
		field: FieldType;
		value: GroupWidgetData | null | undefined;
		children?: any;
	}

	const { field, value, children }: Props = $props();

	const fieldName = $derived(getFieldName(field));

	// preset classes
	const presetClasses = {
		default: {
			container: '',
			header: 'border-b border-gray-200 bg-transparent dark:border-gray-700',
			content: 'bg-transparent pt-3'
		},
		card: {
			container: 'rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-700',
			header: 'rounded-t-lg border-b border-gray-200 bg-gray-50 dark:border-gray-600 dark:bg-gray-700',
			content: 'p-4'
		},
		bordered: {
			container: 'rounded-lg border border-gray-300 dark:border-gray-600',
			header: 'rounded-t-lg border-b border-gray-300 bg-gray-100 dark:border-gray-600 dark:bg-gray-700',
			content: 'rounded-b-lg bg-white p-4 dark:bg-gray-800'
		}
	};

	const preset = $derived(presetClasses[field.preset as keyof typeof presetClasses] || presetClasses.default);

	// State for collapsible functionality
	let isCollapsed = $state(false);
	$effect(() => {
		isCollapsed = (field.collapsed as boolean) || false;
	});

	// Toggle collapse state
	function toggleCollapse(): void {
		if (field.collapsible) {
			isCollapsed = !isCollapsed;
		}
	}

	// Handle keyboard navigation
	function handleKeyDown(event: KeyboardEvent): void {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			toggleCollapse();
		}
	}
</script>

<div class="mb-4 w-full {preset.container}">
	<!-- Group Header -->
	{#if field.groupTitle || field.collapsible}
		{#if field.collapsible}
			<button
				type="button"
				class="flex w-full items-center justify-between p-3 transition-colors duration-200 {preset.header} {field.collapsible
					? 'cursor-pointer hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:hover:bg-gray-700'
					: ''}"
				aria-expanded={!isCollapsed}
				aria-controls={`${fieldName}-content`}
				onclick={toggleCollapse}
				onkeydown={handleKeyDown}
			>
				{#if field.groupTitle}
					<h4 class="m-0 text-base font-semibold text-gray-900 dark:text-gray-100">
						{field.groupTitle}
					</h4>
				{/if}

				<div class="transition-transform duration-200 ease-in-out {isCollapsed ? 'rotate-180' : ''}">
					<iconify-icon icon="mdi:chevron-down" width="18" height="18" class="text-gray-500"></iconify-icon>
				</div>
			</button>
		{:else}
			<div class="flex items-center justify-between p-3 {preset.header}">
				{#if field.groupTitle}
					<h4 class="m-0 text-base font-semibold text-gray-900 dark:text-gray-100">
						{field.groupTitle}
					</h4>
				{/if}
			</div>
		{/if}
	{/if}

	<!-- Group Content -->
	<div
		id={field.collapsible ? `${fieldName}-content` : undefined}
		class="overflow-hidden transition-all duration-200 ease-in-out {preset.content} {isCollapsed ? 'max-h-0 opacity-0' : 'max-h-screen opacity-100'}"
	>
		{#if children}
			{@render children()}
		{:else if value && Object.keys(value).length > 0}
			<div class="rounded border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
				<pre class="whitespace-pre-wrap font-mono text-sm text-gray-700 dark:text-gray-300">{JSON.stringify(value, null, 2)}</pre>
			</div>
		{:else}
			<div class="flex items-center justify-center px-4 py-6">
				<p class="text-center text-sm italic text-gray-500 dark:text-gray-400">No content in this group</p>
			</div>
		{/if}
	</div>
</div>
