<!--
@file src/components/collection-display/widget-loader.svelte
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
- Code-splitting via central widget-loader-registry cache
- Valibot runtime validation when widget defines validationSchema
- Field-level store sync callback (avoids full-form JSON.stringify)
- Error boundary with fallback UI
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import type { FieldInstance } from '@src/content/types';
	import { validationStore } from '@src/stores/store.svelte.ts';
	import { getFieldName } from '@utils/utils';
	import { logger } from '@utils/logger';
	import { safeParse } from 'valibot';

	interface Props {
		collectionName?: string;
		field: FieldInstance;
		loader: () => Promise<{ default: any }>;
		tenantId?: string | null;
		value?: any;
		WidgetData?: Record<string, any>;
		/** Called when value changes — parent patches global store field-by-field. */
		onFieldSync?: () => void;
	}

	let {
		loader,
		field,
		WidgetData = {},
		value = $bindable(),
		tenantId,
		collectionName,
		onFieldSync
	}: Props = $props();

	let component: any = $state(null);
	let loading = $state(true);
	let error = $state<Error | null>(null);
	let lastSyncedValue = $state.raw<unknown>(value);
	let skipFirstSync = true;

	function runWidgetValidation(v: unknown) {
		const widget = field.widget as { validationSchema?: unknown | ((f: FieldInstance) => unknown) } | undefined;
		if (!widget?.validationSchema) return;

		let schema = widget.validationSchema;
		if (typeof schema === 'function') {
			schema = schema(field);
		}

		const fieldName = getFieldName(field, false);
		const result = safeParse(schema as Parameters<typeof safeParse>[0], v);
		if (!result.success) {
			const message = result.issues[0]?.message || 'Invalid value';
			validationStore.setError(fieldName, String(message));
		} else if (validationStore.hasError(fieldName)) {
			validationStore.clearError(fieldName);
		}
	}

	$effect(() => {
		const v = value;
		if (v === lastSyncedValue) return;
		lastSyncedValue = v;
		runWidgetValidation(v);
		if (skipFirstSync) {
			skipFirstSync = false;
			return;
		}
		onFieldSync?.();
	});

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

	$effect(() => {
		// Identity of `loader` changes every parent render (registry returns a
		// fresh closure). Reload only when the widget *name* changes.
		void field.widget?.Name;
		void loadComponent();
	});
</script>

{#if loading}
	<div class="widget-loader-placeholder animate-pulse">
		<div class="mb-2 h-4 w-1/3 rounded bg-surface-300 dark:bg-surface-600"></div>
		<div class="h-10 w-full rounded bg-surface-200 dark:bg-surface-700"></div>
	</div>
{:else if error}
	<div class="widget-loader-error rounded border border-error-500 bg-error-500/10 p-4 dark:bg-error-900/20">
		<div class="mb-2 flex items-center gap-2">
			<iconify-icon icon="mdi:alert-circle" class="text-error-500" width="20"></iconify-icon>
			<span class="font-semibold text-error-600 dark:text-error-500">Widget Load Error</span>
		</div>
		<p class="text-sm text-error-600 dark:text-error-400">Failed to load widget: <strong>{field.widget?.Name || 'Unknown'}</strong></p>
		<p class="mt-1 text-xs text-error-500 dark:text-error-500">{error.message}</p>
		<Button variant="error" onclick={() => loadComponent()} size="sm" class="mt-3">
			<iconify-icon icon="mdi:refresh" width="16" class="me-1"></iconify-icon>
			Retry
		</Button>
	</div>
{:else if component}
	{const Component = component}
	<Component {field} bind:value {WidgetData} {tenantId} {collectionName} />
{:else}
	<div class="widget-loader-empty rounded border border-warning-500 bg-warning-500/10 p-3 dark:bg-warning-900/20">
		<p class="text-sm text-warning-600 dark:text-warning-400">Widget component not available</p>
	</div>
{/if}

<style>
	.widget-loader-placeholder {
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