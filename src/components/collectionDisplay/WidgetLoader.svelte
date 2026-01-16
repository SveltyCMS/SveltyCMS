<!--
@file src/components/collectionDisplay/WidgetLoader.svelte
@component WidgetLoader - Async widget component loader with code-splitting

@description
This component enables dynamic, asynchronous loading of widget components,
supporting code-splitting for better performance. It loads widgets on-demand
rather than bundling all widgets upfront.

@example
<WidgetLoader
  loader={widgetLoader}
  field={field}
  bind:value={entryValue}
  tenantId={tenantId}
/>


### Features
- Async component loading with Suspense-like behavior
- Code-splitting support via import.meta.glob
- Error boundary with fallback UI
- Loading state management
- TypeScript support
-->

<script lang="ts">
	import type { FieldInstance } from '@src/content/types';
	import { onMount } from 'svelte';
	import { logger } from '@utils/logger';

	interface Props {
		loader: () => Promise<{ default: any }>;
		field: FieldInstance;
		WidgetData?: Record<string, any>;
		value?: any;
		tenantId?: string;
	}

	let { loader, field, WidgetData = {}, value = $bindable(), tenantId }: Props = $props();

	// Component state
	let component: any = $state(null);
	let loading = $state(true);
	let error = $state<Error | null>(null);

	// Load the widget component asynchronously
	async function loadComponent() {
		try {
			loading = true;
			error = null;

			const module = await loader();
			component = module.default;

			logger.debug('[WidgetLoader] Component loaded:', {
				widget: field.widget?.Name || 'unknown',
				field: field.label
			});
		} catch (err) {
			error = err instanceof Error ? err : new Error(String(err));
			logger.error('[WidgetLoader] Failed to load component:', {
				widget: field.widget?.Name || 'unknown',
				field: field.label,
				error: error.message
			});
		} finally {
			loading = false;
		}
	}

	// Load on mount
	onMount(() => {
		loadComponent();
	});
</script>

{#if loading}
	<!-- Loading skeleton -->
	<div class="widget-loader-skeleton animate-pulse">
		<div class="mb-2 h-4 w-1/3 rounded bg-surface-300 dark:bg-surface-600"></div>
		<div class="h-10 w-full rounded bg-surface-200 dark:bg-surface-700"></div>
	</div>
{:else if error}
	<!-- Error fallback -->
	<div class="widget-loader-error rounded-lg border border-error-500 bg-error-50 p-4 dark:bg-error-900/20">
		<div class="mb-2 flex items-center gap-2">
			<iconify-icon icon="mdi:alert-circle" class="text-error-500" width="20"></iconify-icon>
			<span class="font-semibold text-error-700 dark:text-error-400">Widget Load Error</span>
		</div>
		<p class="text-sm text-error-600 dark:text-error-300">
			Failed to load widget: <strong>{field.widget?.Name || 'Unknown'}</strong>
		</p>
		<p class="mt-1 text-xs text-error-500 dark:text-error-400">{error.message}</p>
		<button class="preset-ghost-error-500 btn btn-sm mt-3" onclick={() => loadComponent()}>
			<iconify-icon icon="mdi:refresh" width="16" class="mr-1"></iconify-icon>
			Retry
		</button>
	</div>
{:else if component}
	<!-- Loaded component -->
	<!-- Loaded component -->
	{@const Component = component}
	<Component {field} bind:value {WidgetData} {tenantId} />
{:else}
	<!-- Unexpected state -->
	<div class="widget-loader-empty rounded border border-warning-500 bg-warning-50 p-3 dark:bg-warning-900/20">
		<p class="text-sm text-warning-700 dark:text-warning-300">Widget component not available</p>
	</div>
{/if}

<style>
	.widget-loader-skeleton {
		min-height: 60px;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	.animate-pulse {
		animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}
</style>
