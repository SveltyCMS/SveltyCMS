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
	import { PRESETS } from '@src/routes/setup/presets';
	import {
		builder_quickstart_available_templates,
		builder_quickstart_cancel_aria,
		builder_quickstart_creates_label,
		builder_quickstart_creates_plural,
		builder_quickstart_creates_singular,
		builder_quickstart_install,
		builder_quickstart_install_aria,
		builder_quickstart_intro_part1,
		builder_quickstart_more,
		builder_quickstart_template_aria,
		button_cancel,
		common_recommended
	} from '@src/paraglide/messages';

	interface Props {
		close?: (result?: { presetId: string } | null) => void;
	}

	const { close }: Props = $props();

	let selectedPreset = $state<string | null>(null);
	let hoveredPreset = $state<string | null>(null);

	const availablePresets = $derived(
		PRESETS.filter((p) => p.collections && p.collections.length > 0)
	);

	function selectPreset(id: string) {
		selectedPreset = id;
	}

	function handleInstall() {
		if (!selectedPreset) return;
		// Stage only: no server write. The board's Save button commits the preset.
		close?.({ presetId: selectedPreset });
	}

	function getComplexityVariant(
		complexity: string | undefined = undefined
	): 'tertiary' | 'warning' | 'error' | 'surface' {
		switch (complexity) {
			case 'simple':
				return 'tertiary';
			case 'moderate':
				return 'warning';
			case 'advanced':
				return 'error';
			default:
				return 'surface';
		}
	}
</script>

<div class="modal-quick-start space-y-5" role="dialog" aria-describedby="quick-start-desc">
	<!-- Description -->
	<p id="quick-start-desc" class="text-sm text-surface-600 dark:text-surface-400">
		{builder_quickstart_intro_part1()}
		{availablePresets.length}{' '}
		{builder_quickstart_available_templates()}
	</p>

	<!-- Template Grid -->
	<div
		class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
		role="radiogroup"
		aria-label={builder_quickstart_template_aria()}
	>
		{#each availablePresets as preset (preset.id)}
			{@const isSelected = selectedPreset === preset.id}
			{@const collections = preset.collections ?? []}
			<Button
				type="button"
				variant="transparent"
				role="radio"
				aria-checked={isSelected}
				onclick={() => selectPreset(preset.id)}
				onmouseenter={() => (hoveredPreset = preset.id)}
				onmouseleave={() => (hoveredPreset = null)}
				class="relative h-auto! w-full flex-col items-stretch justify-start rounded-lg border-2 p-4! text-start hover:-translate-y-0.5 {isSelected
					? 'border-tertiary-500 dark:border-primary-500 bg-tertiary-500/6 dark:bg-primary-500/8 ring-2 ring-tertiary-500/20 dark:ring-primary-500/20 shadow-md'
					: hoveredPreset === preset.id
						? 'border-surface-500 dark:border-surface-600 bg-surface-500/10 dark:bg-surface-700/60'
						: 'border-(--admin-border-default) bg-(--admin-bg-card) hover:border-tertiary-500 dark:hover:border-primary-400'}"
			>
				<!-- Icon, Title & Selection -->
				<div class="mb-3 flex items-start gap-2.5">
					<div
						class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-tertiary-500/10 dark:bg-primary-500/10"
					>
						<iconify-icon
							icon={preset.icon}
							width="20"
							class="text-tertiary-600 dark:text-primary-400"
							aria-hidden="true"
						></iconify-icon>
					</div>
					<div class="min-w-0 flex-1">
						<h3 class="truncate text-sm font-semibold text-(--admin-text-body)">
							{preset.title}
						</h3>
						<div class="mt-1 flex flex-wrap items-center gap-1.5">
							{#if preset.recommended}
								<Badge variant="tertiary" preset="tonal" size="sm">{common_recommended()}</Badge>
							{/if}
							<Badge variant={getComplexityVariant(preset.complexity)} preset="tonal" size="sm">
								{preset.complexity ?? 'moderate'}
							</Badge>
						</div>
					</div>
					{#if isSelected}
						<iconify-icon
							icon="mdi:check-circle"
							width="22"
							class="shrink-0 text-tertiary-500 dark:text-primary-400"
							aria-hidden="true"
						></iconify-icon>
					{/if}
				</div>

				<!-- Description -->
				<p class="mb-3 text-xs leading-relaxed text-surface-600 dark:text-surface-400">
					{preset.description}
				</p>

				<!-- Collections Preview -->
				<div
					class="mt-auto space-y-1.5 border-t border-surface-100 pt-3 dark:border-surface-500/40"
				>
					<span class="text-xs font-medium text-surface-500 dark:text-surface-400"
						>{builder_quickstart_creates_label()}{' '}
						{collections.length !== 1
							? builder_quickstart_creates_plural({ count: collections.length })
							: builder_quickstart_creates_singular({ count: collections.length })}</span
					>
					<div class="flex flex-wrap gap-1">
						{#each collections.slice(0, 4) as col (col.name)}
							<span
								class="inline-flex items-center gap-1 rounded-full bg-surface-500/10 px-2 py-0.5 text-xs text-surface-600 dark:bg-surface-700 dark:text-surface-200"
							>
								<iconify-icon
									icon={col.icon}
									width="12"
									class="text-tertiary-500 dark:text-primary-400"
									aria-hidden="true"
								></iconify-icon>
								{col.label}
							</span>
						{/each}
						{#if collections.length > 4}
							<span
								class="inline-flex items-center rounded-full bg-surface-500/10 px-2 py-0.5 text-xs text-surface-500 dark:bg-surface-700 dark:text-surface-400"
								>+{collections.length - 4} {builder_quickstart_more()}</span
							>
						{/if}
					</div>
				</div>
			</Button>
		{/each}
	</div>

	<!-- Footer Actions -->
	<footer
		class="flex items-center justify-end gap-3 border-t border-surface-500/30 pt-4 dark:border-surface-500/40"
	>
		<Button
			variant="ghost"
			type="button"
			onclick={() => close?.(null)}
			aria-label={builder_quickstart_cancel_aria()}
		>
			{button_cancel()}
		</Button>
		<Button
			variant="tertiary"
			type="button"
			onclick={handleInstall}
			disabled={!selectedPreset}
			aria-label={builder_quickstart_install_aria()}
		>
			<iconify-icon icon="mdi:magic-staff" width="18" aria-hidden="true"></iconify-icon>
			{builder_quickstart_install()}
		</Button>
	</footer>
</div>
