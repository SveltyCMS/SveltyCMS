<!--
@file src/components/system/WidgetValidationWarning.svelte
@component
**Widget Validation Warning — alerts users when collection fields use inactive widgets**

Displays a warning banner when a collection has fields using inactive widgets.
Provides clear information about the issue and actionable steps to resolve it.

@example
<WidgetValidationWarning
	collectionName="Posts"
	fieldsWithIssues={[{ fieldName: 'seo', widget: 'seo', issue: 'Widget "seo" is inactive...' }]}
	missingWidgets={['seo']}
	{onActivateWidgets}
	{onDismiss}
/>

### Props
- `collectionName` {string} - Name of the collection
- `fieldsWithIssues` {Array} - List of fields with inactive widgets
- `missingWidgets` {string[]} - List of inactive widget names
- `onActivateWidgets` {Function} - Callback to activate missing widgets
- `onDismiss` {Function} - Callback to dismiss the warning (optional)
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import { logger } from '@utils/logger';

	const {
		collectionName = '',
		fieldsWithIssues = [],
		missingWidgets = [],
		onActivateWidgets = () => {},
		onDismiss = undefined,
	} = $props();

	let dismissed = $state(false);

	function handleDismiss() {
		dismissed = true;
		if (onDismiss) onDismiss();
		logger.debug('[WidgetValidationWarning] Warning dismissed', { collectionName });
	}

	function handleActivate() {
		onActivateWidgets();
		logger.info('[WidgetValidationWarning] Activate widgets requested', {
			collectionName,
			widgetsToActivate: missingWidgets,
		});
	}
</script>

{#if !dismissed && fieldsWithIssues.length > 0}
	<div
		class="rounded border border-warning-400 bg-warning-50 p-4 shadow-sm dark:border-warning-500/30 dark:bg-warning-500/10"
		role="alert"
		aria-live="polite"
	>
		<!-- Header -->
		<div class="mb-3 flex items-center gap-3">
			<iconify-icon icon="mdi:alert-circle" width="24" class="shrink-0 text-warning-600 dark:text-warning-400"></iconify-icon>
			<h4 class="flex-1 text-lg font-semibold text-warning-700 dark:text-warning-400">
				Inactive Widgets Detected in "{collectionName}"
			</h4>
			{#if onDismiss}
				<Button variant="ghost" type="button" onclick={handleDismiss} aria-label="Dismiss warning" class="p-0! min-w-0">
					<iconify-icon icon="mdi:close" width="20"></iconify-icon>
				</Button>
			{/if}
		</div>

		<!-- Content -->
		<div class="ms-9 space-y-3">
			<p class="font-medium text-warning-700 dark:text-warning-400">
				The following fields cannot be rendered because their widgets are inactive:
			</p>

			<ul class="space-y-1">
				{#each fieldsWithIssues as field (field.fieldName)}
					<li class="border-b border-warning-200 py-1 text-warning-700 dark:border-warning-500/20 dark:text-warning-400 last:border-b-0">
						<strong>{field.fieldName}</strong>: Widget <code class="rounded bg-warning-200 px-1 py-0.5 font-mono text-xs dark:bg-warning-500/20">{field.widget}</code> is inactive
					</li>
				{/each}
			</ul>

			<p class="rounded border-s-4 border-warning-400 bg-warning-100 p-3 text-sm text-warning-700 dark:border-warning-500 dark:bg-warning-500/10 dark:text-warning-400">
				Content for these fields will not display properly until the widgets are activated.
				<strong>Editing entries may result in data loss for these fields.</strong>
			</p>

			<div class="flex flex-wrap gap-3">
				<Button variant="warning" type="button" onclick={handleActivate}>
					<iconify-icon icon="mdi:power" width="18"></iconify-icon>
					Activate Missing Widgets ({missingWidgets.length})
				</Button>
				<Button variant="secondary" href="/dashboard/widgets">
					<iconify-icon icon="mdi:cog" width="18"></iconify-icon>
					Manage Widgets
				</Button>
			</div>
		</div>
	</div>
{/if}
