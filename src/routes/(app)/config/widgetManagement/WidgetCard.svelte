<!--
@component Enhanced Widget Card
**Displays widget information with 3-pillar architecture details**
-->
<script lang="ts">
	import { slide } from 'svelte/transition';

	interface Props {
		widget: {
			name: string;
			icon: string;
			description: string;
			isCore: boolean;
			isActive: boolean;
			dependencies: string[];
			pillar?: {
				definition: {
					name: string;
					description?: string;
					icon?: string;
					guiSchema?: number;
					aggregations?: boolean;
				};
				input: {
					componentPath: string;
					exists: boolean;
				};
				display: {
					componentPath: string;
					exists: boolean;
				};
			};
			canDisable: boolean;
		};
		onToggle: (name: string) => void;
		onUninstall?: (name: string) => void;
		canManage: boolean;
	}

	let { widget, onToggle, onUninstall, canManage }: Props = $props();
	let expanded = $state(false);
</script>

<div class="group relative overflow-hidden rounded-lg border bg-white shadow-sm transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
	<!-- Widget Header -->
	<div class="flex items-start justify-between gap-4 p-4">
		<div class="flex min-w-0 flex-1 items-start gap-3">
			<div
				class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-tertiary-50 text-tertiary-500 dark:bg-primary-900/20 dark:text-primary-500"
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
						<span class="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-300">
							Active
						</span>
					{:else}
						<span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-300"> Inactive </span>
					{/if}
				</div>
				{#if widget.description}
					<p class="mt-1 line-clamp-2 text-sm text-gray-600 dark:text-gray-400">{widget.description}</p>
				{/if}
			</div>
		</div>

		<!-- Actions -->
		<div class="flex items-center gap-2">
			<!-- Expand button -->
			<button
				onclick={() => (expanded = !expanded)}
				class="rounded-lg p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
				title={expanded ? 'Collapse details' : 'Expand details'}
			>
				<iconify-icon icon={expanded ? 'mdi:chevron-up' : 'mdi:chevron-down'} class="text-xl"></iconify-icon>
			</button>

			<!-- Toggle Active Status -->
			{#if canManage && widget.canDisable}
				<button
					onclick={() => onToggle(widget.name)}
					class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors {widget.isActive
						? 'bg-green-600 text-white hover:bg-green-700'
						: 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300'}"
				>
					{widget.isActive ? 'Active' : 'Inactive'}
				</button>
			{:else if widget.isCore}
				<span class="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400"> Always On </span>
			{:else if !widget.canDisable}
				<span
					class="rounded-lg bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
					title="Required by other widgets"
				>
					Required
				</span>
			{/if}

			<!-- Uninstall (only for inactive custom widgets) -->
			{#if canManage && !widget.isCore && !widget.isActive && onUninstall}
				<button
					onclick={() => onUninstall?.(widget.name)}
					class="rounded-lg p-2 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
					title="Uninstall widget"
				>
					<iconify-icon icon="mdi:delete" class="text-xl"></iconify-icon>
				</button>
			{/if}
		</div>
	</div>

	<!-- Expanded Details -->
	{#if expanded}
		<div transition:slide={{ duration: 200 }} class="border-t bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
			<div class="space-y-4">
				<!-- 3-Pillar Architecture -->
				{#if widget.pillar}
					<div>
						<h4 class="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
							<iconify-icon icon="mdi:view-column" class="text-lg"></iconify-icon>
							3-Pillar Architecture
						</h4>
						<div class="grid grid-cols-1 gap-3 md:grid-cols-3">
							<!-- Definition Pillar -->
							<div class="rounded-lg border bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
								<div class="mb-2 flex items-center gap-2">
									<iconify-icon icon="mdi:book-open-variant" class="text-lg text-blue-600 dark:text-blue-400"></iconify-icon>
									<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Definition</span>
								</div>
								<div class="space-y-1 text-xs text-gray-600 dark:text-gray-400">
									<div class="flex items-center gap-2">
										<iconify-icon icon="mdi:tag" class="text-gray-400"></iconify-icon>
										<span>{widget.pillar.definition.name}</span>
									</div>
									{#if widget.pillar.definition.guiSchema && widget.pillar.definition.guiSchema > 0}
										<div class="flex items-center gap-2">
											<iconify-icon icon="mdi:form-select" class="text-green-600"></iconify-icon>
											<span>{widget.pillar.definition.guiSchema} config fields</span>
										</div>
									{/if}
									{#if widget.pillar.definition.aggregations}
										<div class="flex items-center gap-2">
											<iconify-icon icon="mdi:chart-bar" class="text-purple-600"></iconify-icon>
											<span>Has aggregations</span>
										</div>
									{/if}
								</div>
							</div>

							<!-- Input Pillar -->
							<div class="rounded-lg border bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
								<div class="mb-2 flex items-center gap-2">
									<iconify-icon icon="mdi:form-textbox" class="text-lg text-green-600 dark:text-green-400"></iconify-icon>
									<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Input Component</span>
								</div>
								{#if widget.pillar.input.exists}
									<div class="space-y-1 text-xs text-gray-600 dark:text-gray-400">
										<div class="flex items-center gap-2">
											<iconify-icon icon="mdi:check-circle" class="text-green-600"></iconify-icon>
											<span>Configured</span>
										</div>
										<div class="break-all text-xs text-gray-500">{widget.pillar.input.componentPath}</div>
									</div>
								{:else}
									<div class="flex items-center gap-2 text-xs text-amber-600">
										<iconify-icon icon="mdi:alert-circle" class="text-amber-600"></iconify-icon>
										<span>Not configured</span>
									</div>
								{/if}
							</div>

							<!-- Display Pillar -->
							<div class="rounded-lg border bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
								<div class="mb-2 flex items-center gap-2">
									<iconify-icon icon="mdi:view-list" class="text-lg text-purple-600 dark:text-purple-400"></iconify-icon>
									<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Display Component</span>
								</div>
								{#if widget.pillar.display.exists}
									<div class="space-y-1 text-xs text-gray-600 dark:text-gray-400">
										<div class="flex items-center gap-2">
											<iconify-icon icon="mdi:check-circle" class="text-green-600"></iconify-icon>
											<span>Configured</span>
										</div>
										<div class="break-all text-xs text-gray-500">{widget.pillar.display.componentPath}</div>
									</div>
								{:else}
									<div class="flex items-center gap-2 text-xs text-amber-600">
										<iconify-icon icon="mdi:alert-circle" class="text-amber-600"></iconify-icon>
										<span>Not configured</span>
									</div>
								{/if}
							</div>
						</div>
					</div>
				{/if}

				<!-- Dependencies -->
				{#if widget.dependencies && widget.dependencies.length > 0}
					<div>
						<h4 class="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
							<iconify-icon icon="mdi:link-variant" class="text-lg"></iconify-icon>
							Dependencies
						</h4>
						<div class="flex flex-wrap gap-2">
							{#each widget.dependencies as dep}
								<span class="rounded-lg bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
									{dep}
								</span>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
