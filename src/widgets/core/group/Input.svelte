<script lang="ts">
	import { getFieldName } from '@src/utils/utils';
	import type { FieldType } from './';

	let {
		field,
		children
	}: {
		field: FieldType;
		children?: any;
	} = $props();

	const fieldName = getFieldName(field);

	// Computed class for variant
	const containerClass = $derived(`group-container variant-${field.variant || 'default'}`);

	// State for collapsible functionality
	let isCollapsed = $state(field.collapsed || false);

	// Toggle collapse state
	function toggleCollapse() {
		if (field.collapsible) {
			isCollapsed = !isCollapsed;
		}
	}

	// Handle keyboard navigation for accessibility
	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			toggleCollapse();
		}
	}
</script>

<div class={containerClass}>
	<!-- Group Header -->
	{#if field.groupTitle || field.collapsible}
		{#if field.collapsible}
			<button
				class="group-header"
				class:collapsible={field.collapsible}
				class:collapsed={isCollapsed}
				aria-expanded={!isCollapsed}
				aria-controls={`${fieldName}-content`}
				onclick={toggleCollapse}
				onkeydown={handleKeyDown}
			>
				{#if field.groupTitle}
					<h3 class="group-title">{field.groupTitle}</h3>
				{/if}

				<div class="collapse-icon" class:collapsed={isCollapsed}>
					<iconify-icon icon="mdi:chevron-down" width="20" height="20"></iconify-icon>
				</div>
			</button>
		{:else}
			<div class="group-header">
				{#if field.groupTitle}
					<h3 class="group-title">{field.groupTitle}</h3>
				{/if}
			</div>
		{/if}
	{/if}

	<!-- Group Content -->
	<div id={field.collapsible ? `${fieldName}-content` : undefined} class="group-content" class:collapsed={isCollapsed}>
		<!-- Render children widgets here -->
		{#if children}
			{@render children()}
		{:else}
			<div class="group-placeholder">
				<p class="placeholder-text">Add widgets to this group</p>
			</div>
		{/if}
	</div>
</div>

<style lang="postcss">
    @reference "tailwindcss";
	.group-container {
		@apply w-full;
	}

	/* Default variant */
	.variant-default {
		@apply border-0;
	}

	.variant-default .group-header {
		@apply border-b border-gray-200 bg-transparent dark:border-gray-700;
	}

	.variant-default .group-content {
		@apply bg-transparent;
	}

	/* Card variant */
	.variant-card {
		@apply rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800;
	}

	.variant-card .group-header {
		@apply rounded-t-lg border-b border-gray-200 bg-gray-50 dark:border-gray-600 dark:bg-gray-700;
	}

	.variant-card .group-content {
		@apply p-4;
	}

	/* Bordered variant */
	.variant-bordered {
		@apply rounded-lg border border-gray-300 dark:border-gray-600;
	}

	.variant-bordered .group-header {
		@apply rounded-t-lg border-b border-gray-300 bg-gray-100 dark:border-gray-600 dark:bg-gray-700;
	}

	.variant-bordered .group-content {
		@apply rounded-b-lg bg-white p-4 dark:bg-gray-800;
	}

	.group-header {
		@apply flex items-center justify-between p-4 transition-colors duration-200;
	}

	.group-header.collapsible {
		@apply cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700;
	}

	.group-header.collapsible:focus {
		@apply outline-none ring-2 ring-blue-500 ring-offset-2;
	}

	.group-title {
		@apply m-0 text-lg font-semibold text-gray-900 dark:text-gray-100;
	}

	.collapse-icon {
		@apply transition-transform duration-200 ease-in-out;
	}

	.collapse-icon.collapsed {
		@apply rotate-180;
	}

	.group-content {
		@apply overflow-hidden transition-all duration-200 ease-in-out;
	}

	.group-content.collapsed {
		@apply max-h-0 opacity-0;
	}

	.group-content:not(.collapsed) {
		@apply max-h-screen opacity-100;
	}

	.group-placeholder {
		@apply flex items-center justify-center px-4 py-8;
	}

	.placeholder-text {
		@apply text-center italic text-gray-500 dark:text-gray-400;
	}

	/* Responsive design */
	@media (max-width: 640px) {
		.group-header {
			@apply p-3;
		}

		.group-title {
			@apply text-base;
		}

		.variant-card .group-content,
		.variant-bordered .group-content {
			@apply p-3;
		}
	}
</style>
