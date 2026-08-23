<!--
@file src/routes/(app)/config/collectionbuilder/nested-content/modal-quick-start.svelte
@component
**Quick-Start template selection modal for the Collection Builder.**

Displays a grid of available presets with collection previews.
Selecting a template auto-creates the collections using the installTemplateCollections API.

### Features:
- Grid of template cards with icons, complexity, and collection previews
- Recommended + complexity badges matching the site design system
- Keyboard-accessible radio-group selection
- Loading state during installation
- ARIA-accessible keyboard navigation
-->
<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import Badge from '@components/ui/badge.svelte';
	import { PRESETS } from "@src/routes/setup/presets";
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
				const { installTemplateCollections } = await import("../collectionbuilder.remote");
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

	function getComplexityVariant(
		complexity: string | undefined = undefined,
	): "tertiary" | "warning" | "error" | "surface" {
		switch (complexity) {
			case "simple":
				return "tertiary";
			case "moderate":
				return "warning";
			case "advanced":
				return "error";
			default:
				return "surface";
		}
	}
</script>

<div class="modal-quick-start space-y-5" role="dialog" aria-describedby="quick-start-desc">
	<!-- Description -->
	<p id="quick-start-desc" class="text-sm text-surface-600 dark:text-surface-400">
		Choose a pre-built template to instantly create collections for your {availablePresets.length} available templates
	</p>

	<!-- Template Grid -->
	<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="Template selection">
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
				class="relative flex flex-col rounded-lg border-2 p-4 text-start transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg dark:hover:shadow-[0_10px_30px_-12px_rgba(0,0,0,0.6)] {isSelected
					? 'border-tertiary-500 dark:border-primary-500 bg-tertiary-500/[0.06] dark:bg-primary-500/[0.08] ring-2 ring-tertiary-500/20 dark:ring-primary-500/20 shadow-md'
					: hoveredPreset === preset.id
						? 'border-surface-500 dark:border-surface-600 bg-surface-500/10 dark:bg-surface-700/60'
						: 'border-surface-500/30 dark:border-surface-500/40 bg-white dark:bg-surface-800 hover:border-tertiary-500 dark:hover:border-primary-400'}"
				disabled={isSubmitting}
				in:scale={{ duration: 250, delay: 80 * availablePresets.indexOf(preset) }}
			>
				<!-- Icon, Title & Selection -->
				<div class="mb-3 flex items-start gap-2.5">
					<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-tertiary-500/10 dark:bg-primary-500/10">
						<iconify-icon icon={preset.icon} width="20" class="text-tertiary-600 dark:text-primary-400" aria-hidden="true"></iconify-icon>
					</div>
					<div class="min-w-0 flex-1">
						<h3 class="truncate text-sm font-semibold text-surface-900 dark:text-white">{preset.title}</h3>
						<div class="mt-1 flex flex-wrap items-center gap-1.5">
							{#if preset.recommended}
								<Badge variant="tertiary" preset="tonal" size="sm">Recommended</Badge>
							{/if}
							<Badge variant={getComplexityVariant(preset.complexity)} preset="tonal" size="sm">
								{preset.complexity ?? "moderate"}
							</Badge>
						</div>
					</div>
					{#if isSelected}
						<iconify-icon icon="mdi:check-circle" width="22" class="shrink-0 text-tertiary-500 dark:text-primary-400" in:scale={{ duration: 150 }} aria-hidden="true"></iconify-icon>
					{/if}
				</div>

				<!-- Description -->
				<p class="mb-3 text-xs leading-relaxed text-surface-600 dark:text-surface-400">{preset.description}</p>

				<!-- Collections Preview -->
				<div class="mt-auto space-y-1.5 border-t border-surface-100 pt-3 dark:border-surface-500/40">
					<span class="text-xs font-medium text-surface-500 dark:text-surface-400">Creates {collections.length} collection{collections.length !== 1 ? 's' : ''}:</span>
					<div class="flex flex-wrap gap-1">
						{#each collections.slice(0, 4) as col (col.name)}
							<span class="inline-flex items-center gap-1 rounded-full bg-surface-500/10 px-2 py-0.5 text-xs text-surface-600 dark:bg-surface-700 dark:text-surface-200">
								<iconify-icon icon={col.icon} width="12" class="text-tertiary-500 dark:text-primary-400" aria-hidden="true"></iconify-icon>
								{col.label}
							</span>
						{/each}
						{#if collections.length > 4}
							<span class="inline-flex items-center rounded-full bg-surface-500/10 px-2 py-0.5 text-xs text-surface-500 dark:bg-surface-700 dark:text-surface-400">+{collections.length - 4} more</span>
						{/if}
					</div>
				</div>
			</button>
		{/each}
	</div>

	<!-- Footer Actions -->
	<footer class="flex items-center justify-end gap-3 border-t border-surface-500/30 pt-4 dark:border-surface-500/40">
		<Button variant="ghost"
			type="button"
			onclick={() => close?.(null)}
			disabled={isSubmitting}
			aria-label="Cancel template selection"
		>
			Cancel
		</Button>
		<Button variant="tertiary"
			type="button"
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
		</Button>
	</footer>
</div>
