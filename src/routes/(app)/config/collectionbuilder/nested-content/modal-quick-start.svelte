<!--
@file src/routes/(app)/config/collectionbuilder/nested-content/modal-quick-start.svelte
@component
**Quick-Start template selection modal for the Collection Builder.**

Displays a grid of available presets with collection previews.
Selecting a template auto-creates the collections using the installTemplateCollections API.

### Features:
- Grid of template cards with icons and descriptions
- Preview of collections each template will create
- Loading state during installation
- ARIA-accessible keyboard navigation
-->
<script lang="ts">
	import { PRESETS } from "@src/routes/setup/presets";
	import { installTemplateCollections } from "../collectionbuilder.remote";
	import { toast } from "@src/stores/toast.svelte.ts";
	import { logger } from "@utils/logger";
	import { scale } from "svelte/transition";

	interface Props {
		close?: (result?: { installed: boolean; collections?: string[] } | null) => void;
	}

	const { close }: Props = $props();

	let selectedPreset = $state<string | null>(null);
	let isSubmitting = $state(false);
	let hoveredPreset = $state<string | null>(null);

	const availablePresets = $derived(
		PRESETS.filter((p) => p.collections && p.collections.length > 0)
	);

	function selectPreset(id: string) {
		selectedPreset = id;
	}

	async function handleInstall() {
		if (!selectedPreset) return;

		try {
			isSubmitting = true;
			const result = await installTemplateCollections(selectedPreset);

			if ("success" in result && result.success) {
				toast.success(result.message ?? "Collections created successfully");
				close?.({ installed: true, collections: (result as any).collections ?? [] });
			} else {
				const message = (result as any).message ?? "Failed to install template";
				toast.error(message);
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			logger.error("Quick-Start template install failed:", msg);
			toast.error(msg || "An error occurred while installing the template");
		} finally {
			isSubmitting = false;
		}
	}

	function getComplexityColor(complexity?: string): string {
		switch (complexity) {
			case "simple":
				return "text-tertiary-500 dark:text-primary-500";
			case "moderate":
				return "text-warning-500";
			case "advanced":
				return "text-error-500";
			default:
				return "text-surface-500";
		}
	}
</script>

<div class="modal-quick-start space-y-6" role="dialog" aria-labelledby="quick-start-title" aria-describedby="quick-start-desc">
	<!-- Header -->
	<div class="text-center">
		<h2 id="quick-start-title" class="text-xl font-bold text-surface-900 dark:text-white">
			Quick-Start Templates
		</h2>
		<p id="quick-start-desc" class="mt-1 text-sm text-surface-500">
			Choose a pre-built template to instantly create collections for your {availablePresets.length} available templates
		</p>
	</div>

	<!-- Template Grid -->
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="Template selection">
		{#each availablePresets as preset (preset.id)}
			{@const isSelected = selectedPreset === preset.id}
			{@const collections = preset.collections ?? []}
			<button
				type="button"
				role="radio"
				aria-checked={isSelected}
				onclick={() => selectPreset(preset.id)}
				onmouseenter={() => (hoveredPreset = preset.id)}
				onmouseleave={() => (hoveredPreset = null)}
				onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectPreset(preset.id); } }}
				class="relative flex flex-col rounded-xl border-2 p-4 text-start transition-all duration-200 hover:shadow-lg {isSelected
					? 'border-tertiary-500 dark:border-primary-500 bg-tertiary-500/5 dark:bg-primary-500/5 shadow-md'
					: hoveredPreset === preset.id
						? 'border-surface-400 dark:border-surface-500 bg-surface-100 dark:bg-surface-700/80'
						: 'border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800/50 hover:border-surface-300 dark:hover:border-surface-600'}"
				disabled={isSubmitting}
				in:scale={{ duration: 300, delay: 100 * availablePresets.indexOf(preset) }}
			>
				<!-- Selection indicator -->
				{#if isSelected}
					<div class="absolute inset-e-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-tertiary-500 dark:bg-primary-500 text-white" in:scale={{ duration: 150 }}>
						<iconify-icon icon="mdi:check" width="14" aria-hidden="true"></iconify-icon>
					</div>
				{/if}

				<!-- Icon & Title -->
				<div class="mb-3 flex items-center gap-3">
					<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-100 dark:bg-surface-700">
						<iconify-icon icon={preset.icon} width="22" class="text-tertiary-600 dark:text-primary-400" aria-hidden="true"></iconify-icon>
					</div>
					<div>
						<h3 class="text-sm font-semibold text-surface-900 dark:text-white">{preset.title}</h3>
						<span class="text-xs {getComplexityColor(preset.complexity)}">{preset.complexity ?? "moderate"}</span>
					</div>
				</div>

				<!-- Description -->
				<p class="mb-3 text-xs leading-relaxed text-surface-500">{preset.description}</p>

				<!-- Collections Preview -->
				<div class="mt-auto space-y-1 border-t border-surface-100 pt-3 dark:border-surface-700">
					<span class="text-xs font-medium text-surface-400">Creates {collections.length} collection{collections.length !== 1 ? 's' : ''}:</span>
					<div class="flex flex-wrap gap-1">
						{#each collections.slice(0, 4) as col}
							<span class="inline-flex items-center gap-1 rounded-full bg-surface-100 px-2 py-0.5 text-xs text-surface-600 dark:bg-surface-700 dark:text-surface-300">
								<iconify-icon icon={col.icon} width="12" aria-hidden="true"></iconify-icon>
								{col.label}
							</span>
						{/each}
						{#if collections.length > 4}
							<span class="inline-flex items-center rounded-full bg-surface-100 px-2 py-0.5 text-xs text-surface-400 dark:bg-surface-700">+{collections.length - 4} more</span>
						{/if}
					</div>
				</div>
			</button>
		{/each}
	</div>

	<!-- Footer Actions -->
	<footer class="flex items-center justify-end gap-3 border-t border-surface-200 pt-4 dark:border-surface-700">
		<button
			type="button"
			class="btn preset-outlined-secondary-500"
			onclick={() => close?.(null)}
			disabled={isSubmitting}
			aria-label="Cancel template selection"
		>
			Cancel
		</button>
		<button
			type="button"
			class="btn preset-filled-tertiary-500 dark:preset-filled-primary-500"
			onclick={handleInstall}
			disabled={isSubmitting || !selectedPreset}
			aria-label="Install selected template collections"
		>
			{#if isSubmitting}
				<iconify-icon icon="mdi:loading" width="18" class="animate-spin" aria-hidden="true"></iconify-icon>
				Installing...
			{:else}
				<iconify-icon icon="mdi:magic-staff" width="18" aria-hidden="true"></iconify-icon>
				Install Template
			{/if}
		</button>
	</footer>
</div>
