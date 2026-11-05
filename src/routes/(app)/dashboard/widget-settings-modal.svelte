<!--
@file src/routes/(app)/dashboard/widget-settings-modal.svelte
@component
**In-place settings modal for configuring individual dashboard widgets**

### Props
- `open` {boolean} - Bindable open state
- `label` {string} - Current widget display label
- `size` {WidgetSize} - Current grid size
- `pollInterval` {number} - Polling interval in milliseconds
- `settings` {Record<string, unknown>} - Custom widget settings
- `onSave` {(updated: { label: string; size: WidgetSize; pollInterval: number; settings: Record<string, unknown> }) => void} - Save callback

### Features:
- Customize widget title / label
- Change refresh rate (Manual, 5s, 10s, 30s, 1m, 5m)
- Change grid dimensions with a dimension preview
- WCAG 2.2 AA dialog with radio-group semantics and unique ids
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import type { WidgetSize } from '@src/content/types';
	import Modal from '@components/ui/modal.svelte';
	import Button from '@components/ui/button.svelte';
	import Input from '@components/ui/input.svelte';
	import {
		button_cancel,
		common_save_changes,
		dashboard_widget_configure_title,
		dashboard_widget_grid_size,
		dashboard_widget_refresh_every,
		dashboard_widget_refresh_manual,
		dashboard_widget_refresh_rate,
		dashboard_widget_title,
		dashboard_widget_title_ph
	} from '@src/paraglide/messages';

	interface Props {
		open?: boolean;
		label: string;
		size: WidgetSize;
		pollInterval?: number;
		settings?: Record<string, unknown>;
		onSave: (updated: {
			label: string;
			size: WidgetSize;
			pollInterval: number;
			settings: Record<string, unknown>;
		}) => void;
	}

	let {
		open = $bindable(false),
		label,
		size,
		pollInterval = 0,
		settings = {},
		onSave
	}: Props = $props();

	const uid = $props.id();
	const titleId = `${uid}-title`;
	const refreshLabelId = `${uid}-refresh-label`;
	const sizeLabelId = `${uid}-size-label`;

	let editLabel = $state(untrack(() => label));
	let editSize = $state<WidgetSize>(untrack(() => ({ ...size })));
	let editPollInterval = $state(untrack(() => pollInterval));
	const editSettings: Record<string, unknown> = untrack(() => ({ ...settings }));

	// Sync local state when modal opens
	$effect(() => {
		if (open) {
			editLabel = label;
			editSize = { ...size };
			editPollInterval = pollInterval;
		}
	});

	const REFRESH_OPTIONS = [
		{ label: () => dashboard_widget_refresh_manual(), value: 0 },
		{ label: () => dashboard_widget_refresh_every({ value: '5s' }), value: 5_000 },
		{ label: () => dashboard_widget_refresh_every({ value: '10s' }), value: 10_000 },
		{ label: () => dashboard_widget_refresh_every({ value: '30s' }), value: 30_000 },
		{ label: () => dashboard_widget_refresh_every({ value: '1m' }), value: 60_000 },
		{ label: () => dashboard_widget_refresh_every({ value: '5m' }), value: 300_000 }
	];

	const SIZE_PRESETS: Array<{ label: string; size: WidgetSize }> = [
		{ label: '1 × 1', size: { w: 1, h: 1 } },
		{ label: '1 × 2', size: { w: 1, h: 2 } },
		{ label: '2 × 1', size: { w: 2, h: 1 } },
		{ label: '2 × 2', size: { w: 2, h: 2 } },
		{ label: '3 × 2', size: { w: 3, h: 2 } },
		{ label: '4 × 2', size: { w: 4, h: 2 } }
	];

	function handleSave() {
		onSave({
			label: editLabel.trim() || label,
			size: editSize,
			pollInterval: editPollInterval,
			settings: editSettings
		});
		open = false;
	}
</script>

<Modal bind:open title={dashboard_widget_configure_title()} size="md" color="surface">
	<div class="space-y-5 py-2">
		<!-- Widget Label -->
		<div>
			<label
				for={titleId}
				class="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-(--admin-text-muted)"
			>
				{dashboard_widget_title()}
			</label>
			<Input
				id={titleId}
				type="text"
				bind:value={editLabel}
				placeholder={dashboard_widget_title_ph()}
				class="w-full"
			/>
		</div>

		<!-- Refresh Interval -->
		<div>
			<span
				id={refreshLabelId}
				class="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-(--admin-text-muted)"
			>
				{dashboard_widget_refresh_rate()}
			</span>
			<div
				class="grid grid-cols-2 gap-2 sm:grid-cols-3"
				role="radiogroup"
				aria-labelledby={refreshLabelId}
			>
				{#each REFRESH_OPTIONS as opt (opt.value)}
					<button
						type="button"
						role="radio"
						aria-checked={editPollInterval === opt.value}
						class="flex items-center justify-between rounded-lg border px-3 py-2 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-tertiary-500 dark:focus-visible:ring-primary-500 {editPollInterval ===
						opt.value
							? 'border-tertiary-500 bg-tertiary-500/10 text-tertiary-600 dark:border-primary-500 dark:bg-primary-900/20 dark:text-primary-400 font-semibold'
							: 'border-(--admin-border-default) bg-surface-500/10 text-(--admin-text-body) hover:bg-surface-500/10'}"
						onclick={() => (editPollInterval = opt.value)}
					>
						<span>{opt.label()}</span>
						{#if editPollInterval === opt.value}
							<iconify-icon
								icon="mdi:check"
								width={14}
								class="text-tertiary-500 dark:text-primary-500"
							></iconify-icon>
						{/if}
					</button>
				{/each}
			</div>
		</div>

		<!-- Grid Dimensions -->
		<div>
			<span
				id={sizeLabelId}
				class="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-(--admin-text-muted)"
			>
				{dashboard_widget_grid_size()}
			</span>
			<div
				class="grid grid-cols-2 gap-2 sm:grid-cols-3"
				role="radiogroup"
				aria-labelledby={sizeLabelId}
			>
				{#each SIZE_PRESETS as preset (preset.label)}
					{@const isSelected = editSize.w === preset.size.w && editSize.h === preset.size.h}
					<button
						type="button"
						role="radio"
						aria-checked={isSelected}
						class="flex items-center justify-between rounded-lg border px-3 py-2 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-tertiary-500 dark:focus-visible:ring-primary-500 {isSelected
							? 'border-tertiary-500 bg-tertiary-500/10 text-tertiary-600 dark:border-primary-500 dark:bg-primary-900/20 dark:text-primary-400 font-semibold'
							: 'border-(--admin-border-default) bg-surface-500/10 text-(--admin-text-body) hover:bg-surface-500/10'}"
						onclick={() => (editSize = { ...preset.size })}
					>
						<span>{preset.label}</span>
						{#if isSelected}
							<iconify-icon
								icon="mdi:check"
								width={14}
								class="text-tertiary-500 dark:text-primary-500"
							></iconify-icon>
						{/if}
					</button>
				{/each}
			</div>
		</div>
	</div>

	{#snippet footer()}
		<div class="flex items-center justify-end gap-2">
			<Button variant="ghost" onclick={() => (open = false)}>{button_cancel()}</Button>
			<Button variant="primary" onclick={handleSave}>{common_save_changes()}</Button>
		</div>
	{/snippet}
</Modal>
