<!--
@file src/components/system/WidgetValidationWarning.svelte
@component
**Widget Validation Warning component for displaying inactive widget alerts**

Displays a warning banner when a collection has fields using inactive widgets.
Provides clear information about the issue and actionable steps to resolve it.

@example
<WidgetValidationWarning
	collectionName="Posts"
	fieldsWithIssues={[
		{ fieldName: 'seo', widget: 'seo', issue: 'Widget "seo" is inactive...' }
	]}
	missingWidgets={['seo']}
	{onActivateWidgets}
	{onDismiss}
/>

#### Props
- `collectionName` {string} - Name of the collection
- `fieldsWithIssues` {Array} - List of fields with inactive widgets
- `missingWidgets` {string[]} - List of inactive widget names
- `onActivateWidgets` {Function} - Callback to activate missing widgets
- `onDismiss` {Function} - Callback to dismiss the warning (optional)
-->

<script lang="ts">
	// Utils
	import { logger } from '@utils/logger';

	// Lucide Icons
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import CloseIcon from '@lucide/svelte/icons/x';
	import Power from '@lucide/svelte/icons/power';
	import Settings from '@lucide/svelte/icons/settings';

	const { collectionName = '', fieldsWithIssues = [], missingWidgets = [], onActivateWidgets = () => {}, onDismiss = undefined } = $props();

	let dismissed = $state(false);

	function handleDismiss() {
		dismissed = true;
		if (onDismiss) {
			onDismiss();
		}
		logger.debug('[WidgetValidationWarning] Warning dismissed', { collectionName });
	}

	function handleActivate() {
		onActivateWidgets();
		logger.info('[WidgetValidationWarning] Activate widgets requested', {
			collectionName,
			widgetsToActivate: missingWidgets
		});
	}
</script>

{#if !dismissed && fieldsWithIssues.length > 0}
	<div class="widget-validation-warning alert-warning alert" role="alert" aria-live="polite">
		<div class="warning-header">
			<CircleAlert size={24} />
			<h4 class="warning-title">
				⚠️ Inactive Widgets Detected in "{collectionName}"
			</h4>
			{#if onDismiss}
				<button type="button" class="dismiss-btn" onclick={handleDismiss} aria-label="Dismiss warning">
					<CloseIcon size={20} />
				</button>
			{/if}
		</div>

		<div class="warning-content">
			<p class="warning-message">The following fields cannot be rendered because their widgets are inactive:</p>

			<ul class="field-issues-list">
				{#each fieldsWithIssues as field (field.fieldName)}
					<li class="field-issue">
						<strong>{field.fieldName}</strong>: Widget <code>{field.widget}</code> is inactive
					</li>
				{/each}
			</ul>

			<p class="warning-explanation">
				Content for these fields will not display properly until the widgets are activated.
				<strong>Editing entries may result in data loss for these fields.</strong>
			</p>

			<div class="warning-actions">
				<button type="button" class="btn-primary btn" onclick={handleActivate}>
					<Power size={18} />
					Activate Missing Widgets ({missingWidgets.length})
				</button>
				<a href="/dashboard/widgets" class="btn-secondary btn">
					<Settings size={18} />
					Manage Widgets
				</a>
			</div>
		</div>
	</div>
{/if}

<style>
	.widget-validation-warning {
		margin-bottom: 1rem;
		padding: 1rem;
		background-color: #fff3cd;
		border: 1px solid #ffc107;
		border-radius: 0.375rem;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	}

	.warning-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}

	.warning-header :global(svg) {
		color: #856404;
		flex-shrink: 0;
	}

	.warning-title {
		margin: 0;
		font-size: 1.125rem;
		font-weight: 600;
		color: #856404;
		flex: 1;
	}

	.dismiss-btn {
		background: transparent;
		border: none;
		cursor: pointer;
		padding: 0.25rem;
		color: #856404;
		transition: color 0.2s;
		flex-shrink: 0;
	}

	.dismiss-btn:hover {
		color: #533f03;
	}

	.warning-content {
		padding-left: 2.5rem;
	}

	.warning-message {
		margin: 0 0 0.5rem 0;
		color: #856404;
		font-weight: 500;
	}

	.field-issues-list {
		margin: 0.5rem 0 1rem 1rem;
		padding: 0;
		list-style: none;
	}

	.field-issue {
		padding: 0.375rem 0;
		color: #856404;
		border-bottom: 1px solid rgba(133, 100, 4, 0.1);
	}

	.field-issue:last-child {
		border-bottom: none;
	}

	.field-issue code {
		background-color: rgba(133, 100, 4, 0.1);
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
		font-family: 'Courier New', monospace;
		font-size: 0.9em;
	}

	.warning-explanation {
		margin: 0.75rem 0 1rem 0;
		padding: 0.75rem;
		background-color: rgba(255, 193, 7, 0.1);
		border-left: 3px solid #ffc107;
		font-size: 0.9rem;
		color: #856404;
	}

	.warning-actions {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		border-radius: 0.375rem;
		font-weight: 500;
		text-decoration: none;
		transition: all 0.2s;
		cursor: pointer;
		border: none;
		font-size: 0.9rem;
	}

	.btn-primary {
		background-color: #ffc107;
		color: #000;
	}

	.btn-primary:hover {
		background-color: #ffca2c;
		transform: translateY(-1px);
		box-shadow: 0 2px 8px rgba(255, 193, 7, 0.3);
	}

	.btn-secondary {
		background-color: #fff;
		color: #856404;
		border: 1px solid #ffc107;
	}

	.btn-secondary:hover {
		background-color: #fff3cd;
		transform: translateY(-1px);
	}

	/* Dark mode support */
	:global(.dark) .widget-validation-warning {
		background-color: rgba(255, 193, 7, 0.15);
		border-color: rgba(255, 193, 7, 0.3);
	}

	:global(.dark) .warning-title,
	:global(.dark) .warning-message,
	:global(.dark) .field-issue,
	:global(.dark) .warning-explanation {
		color: #ffc107;
	}

	:global(.dark) .btn-primary {
		background-color: #ffc107;
		color: #1a1a1a;
	}

	:global(.dark) .btn-secondary {
		background-color: rgba(255, 255, 255, 0.05);
		color: #ffc107;
		border-color: rgba(255, 193, 7, 0.3);
	}

	:global(.dark) .btn-secondary:hover {
		background-color: rgba(255, 193, 7, 0.1);
	}
</style>
