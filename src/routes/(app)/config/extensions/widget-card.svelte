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
	import Badge from '@components/ui/badge.svelte';
	import Button from '@components/ui/button.svelte';
	import {
		widgetcard_active,
		widgetcard_always_active,
		widgetcard_always_active_title,
		widgetcard_core,
		widgetcard_custom,
		widgetcard_db_valid,
		widgetcard_db_valid_title,
		widgetcard_depends_on,
		widgetcard_display,
		widgetcard_display_title,
		widgetcard_inactive,
		widgetcard_input,
		widgetcard_input_title,
		widgetcard_required,
		widgetcard_required_title,
		widgetcard_uninstall_title
	} from '@src/paraglide/messages';
	// Using iconify-icon web component
	interface Props {
		canManage: boolean;
		onToggle: (name: string) => void;
		onUninstall?: (name: string) => void;
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
	}

	const { widget, onToggle, onUninstall, canManage }: Props = $props();
</script>

<div
	class="rounded-xl border border-surface-500/30 bg-white dark:bg-surface-800/80 dark:text-surface-50 shadow-xs transition-shadow hover:shadow-md"
>
	<!-- Widget Header -->
	<div class="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
		<div class="flex min-w-0 flex-1 items-start gap-4">
			<div
				class="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-surface-500/10 text-surface-900 dark:bg-surface-800 dark:text-surface-100"
			>
				<iconify-icon icon={widget.icon} width="32" class="text-3xl"></iconify-icon>
			</div>
			<div class="min-w-0 flex-1 space-y-2">
				<div class="flex flex-wrap items-center gap-2">
					<h3 class="text-lg font-bold text-surface-900 dark:text-surface-50">{widget.name}</h3>
					{#if widget.isCore}
						<Badge variant="primary">{widgetcard_core()}</Badge>
					{:else}
						<Badge variant="tertiary">{widgetcard_custom()}</Badge>
					{/if}
					{#if widget.isActive}
						<Badge variant="success">{widgetcard_active()}</Badge>
					{:else}
						<Badge variant="surface">{widgetcard_inactive()}</Badge>
					{/if}
				</div>
				{#if widget.description}
					<p class="text-sm text-surface-600 dark:text-surface-50 line-clamp-2">
						{widget.description}
					</p>
				{/if}

				<!-- 3-Pillar Architecture Indicators -->
				{#if widget.pillar}
					<div class="flex items-center gap-4 pt-1 text-xs text-surface-500">
						<div class="flex items-center gap-1" title={widgetcard_input_title()}>
							<iconify-icon icon="mdi:form-textbox" width="18"></iconify-icon>
							<span>{widgetcard_input()}</span>
						</div>
						<div class="flex items-center gap-1" title={widgetcard_display_title()}>
							<iconify-icon icon="mdi:monitor-dashboard" width="18"></iconify-icon>
							<span>{widgetcard_display()}</span>
						</div>
						<div class="flex items-center gap-1" title={widgetcard_db_valid_title()}>
							<iconify-icon icon="mdi:database-check" width="18"></iconify-icon>
							<span>{widgetcard_db_valid()}</span>
						</div>
					</div>
				{/if}

				<!-- Dependencies -->
				{#if widget.dependencies && widget.dependencies.length > 0}
					<div class="flex flex-wrap gap-1.5 pt-1">
						<span class="text-xs text-surface-500">{widgetcard_depends_on()}</span>
						{#each widget.dependencies as dep (dep)}
							<Badge variant="secondary" class="text-xs">{dep}</Badge>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<!-- Actions -->
		<div class="flex items-center gap-2 self-end sm:self-auto">
			<!-- Toggle Active Status -->
			{#if widget.isCore}
				<!-- Core widgets are always active and cannot be deactivated -->
				<Badge variant="primary" title={widgetcard_always_active_title()}
					>{widgetcard_always_active()}</Badge
				>
			{:else if canManage && widget.canDisable}
				<Button
					variant="error"
					type="button"
					onclick={() => onToggle(widget.name)}
					data-testid="widget-toggle-{widget.name}"
					size="sm"
				>
					{widget.isActive ? 'Deactivate' : 'Activate'}
				</Button>
			{:else if !widget.canDisable}
				<Badge variant="warning" title={widgetcard_required_title()}>{widgetcard_required()}</Badge>
			{/if}

			<!-- Uninstall (only for inactive custom widgets) -->
			{#if canManage && !widget.isCore && !widget.isActive && onUninstall}
				<Button
					variant="surface"
					type="button"
					onclick={() => onUninstall?.(widget.name)}
					title={widgetcard_uninstall_title()}
					class="p-0! min-w-0"
				>
					<iconify-icon icon="mdi:trash-can-outline" width="20" class="text-lg"></iconify-icon>
				</Button>
			{/if}
		</div>
	</div>
</div>
