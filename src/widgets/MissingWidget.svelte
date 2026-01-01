<!--
@file src/widgets/MissingWidget.svelte
@component
**Enhanced Missing Widget Display**

Shows a helpful message when a widget is missing or disabled.
Provides actionable information for developers and administrators.

@example
<MissingWidget config={fieldInstance} />

### Props
- `config`: FieldInstance - The field configuration that references the missing widget

### Features
- Clear error messaging with widget name
- Helpful suggestions for resolution
- Different displays for development vs production
- Links to widget management
- Accessibility support
-->

<script lang="ts">
	import type { FieldInstance } from '@src/content/types';
	import { logger } from '@utils/logger';

	interface Props {
		config: FieldInstance;
		showDebugInfo?: boolean;
	}

	const { config, showDebugInfo = import.meta.env.DEV }: Props = $props();

	// Extract widget information
	const widgetName = $derived(config.widget?.Name || config.__missingWidgetName || 'Unknown');
	const fieldLabel = $derived(config.label || 'Unnamed Field');
	const fieldName = $derived(config.db_fieldName || 'unknown_field');

	// Log the missing widget for debugging
	$effect(() => {
		logger.warn(`[MissingWidget] Widget "${widgetName}" is missing for field "${fieldLabel}" (${fieldName})`);
	});

	// Determine the appropriate message based on environment
	const isDevelopment = import.meta.env.DEV;
</script>

<div
	class="missing-widget rounded-lg border-2 border-warning-400 bg-warning-50 p-4 dark:border-warning-600 dark:bg-warning-950"
	role="alert"
	aria-live="polite"
>
	<!-- Icon and Title -->
	<div class="mb-2 flex items-start gap-3">
		<svg class="h-6 w-6 shrink-0 text-warning-600 dark:text-warning-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
			/>
		</svg>

		<div class="flex-1">
			<h3 class="text-lg font-semibold text-warning-800 dark:text-warning-200">Missing Widget</h3>

			<!-- Main error message -->
			<p class="mt-1 text-sm text-warning-700 dark:text-warning-300">
				The widget <strong>"{widgetName}"</strong> is not available for the field <strong>"{fieldLabel}"</strong>.
			</p>
		</div>
	</div>

	<!-- Debug Information (Development Only) -->
	{#if showDebugInfo && isDevelopment}
		<div class="mt-3 space-y-2 rounded border border-warning-300 bg-warning-100 p-3 text-xs font-mono dark:border-warning-700 dark:bg-warning-900">
			<div class="flex gap-2">
				<span class="font-semibold text-warning-800 dark:text-warning-200">Widget:</span>
				<span class="text-warning-700 dark:text-warning-300">{widgetName}</span>
			</div>
			<div class="flex gap-2">
				<span class="font-semibold text-warning-800 dark:text-warning-200">Field:</span>
				<span class="text-warning-700 dark:text-warning-300">{fieldName}</span>
			</div>
			<div class="flex gap-2">
				<span class="font-semibold text-warning-800 dark:text-warning-200">Label:</span>
				<span class="text-warning-700 dark:text-warning-300">{fieldLabel}</span>
			</div>
		</div>
	{/if}

	<!-- Suggested Actions -->
	<div class="mt-4 space-y-2">
		<p class="text-sm font-semibold text-warning-800 dark:text-warning-200">Possible Solutions:</p>

		<ul class="ml-4 space-y-1 text-sm text-warning-700 dark:text-warning-300">
			<li class="flex items-start gap-2">
				<span class="mt-0.5">•</span>
				<span
					>Check if the widget is installed and activated in <a
						href="/config/widgetManagement"
						class="underline hover:text-warning-900 dark:hover:text-warning-100">Widget Management</a
					></span
				>
			</li>
			<li class="flex items-start gap-2">
				<span class="mt-0.5">•</span>
				<span>Verify the widget name matches an available widget</span>
			</li>
			<li class="flex items-start gap-2">
				<span class="mt-0.5">•</span>
				<span>Check the collection schema configuration for typos</span>
			</li>
			{#if isDevelopment}
				<li class="flex items-start gap-2">
					<span class="mt-0.5">•</span>
					<span>Ensure the widget module is properly exported from its index.ts</span>
				</li>
			{/if}
		</ul>
	</div>

	<!-- Production Warning -->
	{#if !isDevelopment}
		<div
			class="mt-4 rounded border border-error-300 bg-error-50 p-2 text-xs text-error-700 dark:border-error-700 dark:bg-error-950 dark:text-error-300"
		>
			<strong>Note:</strong> This field will not be editable until the widget is available.
		</div>
	{/if}
</div>

<style>
	.missing-widget {
		animation: fadeIn 0.3s ease-in;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
