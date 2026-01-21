<!--
@files src/routes/(app)/config/widgetManagement/WidgetCard.svelte
@component Enhanced Widget Card
**Displays widget information**

#### Props
widget: {
	name: string;
	icon: string;
	description?: string;
	isCore: boolean;
	isActive: boolean;
	dependencies: string[];
	canDisable: boolean;
	pillar?: {
		input?: { exists: boolean };
		display?: { exists: boolean };
	};
	hasValidation?: boolean;
}
onToggle: (name: string) => void;
onUninstall?: (name: string) => void;
canManage: boolean;

### Features
- Displays widget information
- Toggle active status
- Uninstall widget
-->
<script lang="ts">
	import CircleQuestionMark from '@lucide/svelte/icons/circle-question-mark';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	import Icon from '@iconify/svelte';
	interface Props {
		widget: {
			name: string;
			icon: string;
			description?: string;
			isCore: boolean;
			isActive: boolean;
			dependencies: string[];
			canDisable: boolean;
			pillar?: {
				input?: { exists: boolean };
				display?: { exists: boolean };
			};
			hasValidation?: boolean;
		};
		onToggle: (name: string) => void;
		onUninstall?: (name: string) => void;
		canManage: boolean;
	}

	const { widget, onToggle, onUninstall, canManage }: Props = $props();

	/* Function to determine color for boolean status */
	function getStatusColor(exists: boolean) {
		return exists ? 'text-green-500' : 'text-gray-300 dark:text-gray-600';
	}
</script>

<div class="card border border-surface-200 dark:text-surface-50 transition-shadow hover:shadow-lg">
	<!-- Widget Header -->
	<div class="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
		<div class="flex min-w-0 flex-1 items-start gap-4">
			<div
				class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-100 text-surface-900 dark:bg-surface-800 dark:text-surface-100"
			>
				{#if iconsData[widget.icon as keyof typeof iconsData] as any}<Icon
						icon={iconsData[widget.icon as keyof typeof iconsData] as any}
						class="text-3xl"
					/>{/if}
			</div>
			<div class="min-w-0 flex-1 space-y-2">
				<div class="flex flex-wrap items-center gap-2">
					<h3 class="text-lg font-bold text-surface-900 dark:text-surface-50">
						{widget.name}
					</h3>
					{#if widget.isCore}
						<span class="badge preset-filled-primary-500">Core</span>
					{:else}
						<span class="badge preset-filled-tertiary-500">Custom</span>
					{/if}
					{#if widget.isActive}
						<span class="badge preset-filled-success-500">Active</span>
					{:else}
						<span class="badge preset-filled-surface-500">Inactive</span>
					{/if}
				</div>
				{#if widget.description}
					<p class="text-sm text-surface-600 dark:text-surface-50 line-clamp-2">{widget.description}</p>
				{/if}

				<!-- 3-Pillar Architecture Indicators -->
				{#if widget.pillar}
					<div class="flex items-center gap-4 pt-1 text-xs text-surface-500">
						<div class="flex items-center gap-1" title="Input Component">
							<CircleQuestionMark size={24} />
							<span>Input</span>
						</div>
						<div class="flex items-center gap-1" title="Display Component">
							<CircleQuestionMark size={24} />
							<span>Display</span>
						</div>
						<div class="flex items-center gap-1" title="Database/Validation">
							<CircleQuestionMark size={24} />
							<span>DB/Valid</span>
						</div>
					</div>
				{/if}

				<!-- Dependencies -->
				{#if widget.dependencies && widget.dependencies.length > 0}
					<div class="flex flex-wrap gap-1.5 pt-1">
						<span class="text-xs text-surface-500">Depends on:</span>
						{#each widget.dependencies as dep}
							<span class="badge variant-soft-secondary text-xs">
								{dep}
							</span>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<!-- Actions -->
		<div class="flex items-center gap-2 self-end sm:self-auto">
			<!-- Toggle Active Status -->
			{#if canManage && widget.canDisable}
				<button
					type="button"
					onclick={() => onToggle(widget.name)}
					data-testid="widget-toggle-{widget.name}"
					class="btn-sm {widget.isActive ? 'preset-filled-error-500' : 'preset-filled-success-500'}"
				>
					{widget.isActive ? 'Deactivate' : 'Activate'}
				</button>
			{:else if widget.isCore}
				<span class="badge preset-tonal-surface-500">System</span>
			{:else if !widget.canDisable}
				<span class="badge variant-soft-warning" title="Required by other widgets">Required</span>
			{/if}

			<!-- Uninstall (only for inactive custom widgets) -->
			{#if canManage && !widget.isCore && !widget.isActive && onUninstall}
				<button type="button" onclick={() => onUninstall?.(widget.name)} class="btn-icon btn-icon-sm variant-soft-error" title="Uninstall widget">
					<Trash2 class="text-lg" />
				</button>
			{/if}
		</div>
	</div>
</div>
