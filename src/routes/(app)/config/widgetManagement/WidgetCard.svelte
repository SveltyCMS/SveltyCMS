<!--
@component Enhanced Widget Card
**Displays widget information**
-->
<script lang="ts">
	interface Props {
		widget: {
			name: string;
			icon: string;
			description?: string;
			isCore: boolean;
			isActive: boolean;
			dependencies: string[];
			canDisable: boolean;
		};
		onToggle: (name: string) => void;
		onUninstall?: (name: string) => void;
		canManage: boolean;
	}

	const { widget, onToggle, onUninstall, canManage }: Props = $props();
</script>

<div class="card border border-secondary-500">
	<!-- Widget Header -->
	<div class="flex items-start justify-between gap-4 p-4">
		<div class="flex min-w-0 flex-1 items-start gap-3">
			<div
				class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-tertiary-50 text-tertiary-500 dark:bg-primary-900/20 dark:text-primary-500"
			>
				<iconify-icon icon={widget.icon} class="text-2xl"></iconify-icon>
			</div>
			<div class="min-w-0 flex-1">
				<div class="flex flex-wrap items-center gap-2">
					<h3 class="font-semibold text-gray-900 dark:text-white">
						{widget.name}
					</h3>
					{#if widget.isCore}
						<span class="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"> Core </span>
					{:else}
						<span class="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
							Custom
						</span>
					{/if}
					{#if widget.isActive}
						<span class="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-primary-500 dark:bg-green-900/30"> Active </span>
					{:else}
						<span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-300"> Inactive </span>
					{/if}
				</div>
				{#if widget.description}
					<p class="mt-1 text-sm text-gray-600 dark:text-gray-400">{widget.description}</p>
				{/if}
				<!-- Dependencies -->
				{#if widget.dependencies && widget.dependencies.length > 0}
					<div class="mt-2 flex flex-wrap gap-1.5">
						{#each widget.dependencies as dep}
							<span class="rounded-md bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
								{dep}
							</span>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<!-- Actions -->
		<div class="flex items-center gap-2">
			<!-- Toggle Active Status -->
			{#if canManage && widget.canDisable}
				<button
					type="button"
					onclick={() => onToggle(widget.name)}
					data-testid="widget-toggle-{widget.name}"
					class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors {widget.isActive
						? 'bg-green-600 text-white hover:bg-green-700'
						: 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300'}"
				>
					{widget.isActive ? 'Active' : 'Inactive'}
				</button>
			{:else if widget.isCore}
				<span class="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-primary-500 dark:bg-gray-700"> Always On </span>
			{:else if !widget.canDisable}
				<span class="rounded-lg bg-amber-100 px-3 py-1.5 text-sm font-medium text-warning-500 dark:bg-amber-900/30" title="Required by other widgets">
					Required
				</span>
			{/if}

			<!-- Uninstall (only for inactive custom widgets) -->
			{#if canManage && !widget.isCore && !widget.isActive && onUninstall}
				<button type="button" onclick={() => onUninstall?.(widget.name)} class="preset-ghost-secondary-500 btn-icon" title="Uninstall widget">
					<iconify-icon icon="mdi:delete" class="text-xl"></iconify-icon>
				</button>
			{/if}
		</div>
	</div>
</div>
