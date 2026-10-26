<!--
@file src/routes/(app)/mediagallery/batch-processor.svelte
@component
**Batch image transformation panel (filter presets + uniform resize)**

### Props
- `selectedIds` (SvelteSet<string>): The gallery selection at the time the panel opens.
- `onClose` (function): Dismisses the panel.

### Features:
- Filters (`vivid`, `bw`, `sepia`, `dramatic`) and a uniform width, matching
  `POST /api/media/batch-process` (`{ ids, operation, params }`).
- Reports the server's per-asset outcome (`processed` / `failed`) instead of
  claiming success for the whole batch.
- Refreshes gallery data after a run so dimensions/thumbnails re-render.
-->

<script lang="ts">
	import { toast } from '@src/stores/toast.svelte.ts';
	import { logger } from '@utils/logger';
	import { clientJsonHeaders } from '@utils/security/client-csrf';
	import { refreshAll } from '$app/navigation';
	import { adminSlide } from '@utils/admin-transitions';
	import type { SvelteSet } from 'svelte/reactivity';
	import AdminCard from '@components/admin-card.svelte';
	import Button from '@components/ui/button.svelte';
	import Input from '@components/ui/input.svelte';
	import Select from '@components/ui/select.svelte';
	import {
		button_close,
		mediagallery_batch_apply_filter,
		mediagallery_batch_assets,
		mediagallery_batch_configure,
		mediagallery_batch_engine,
		mediagallery_batch_filter_preset,
		mediagallery_batch_processor,
		mediagallery_batch_resize,
		mediagallery_batch_resize_width,
		mediagallery_batch_run,
		mediagallery_batch_select_action
	} from '@src/paraglide/messages';

	interface Props {
		selectedIds: SvelteSet<string>;
		onClose: () => void;
	}

	let { selectedIds, onClose }: Props = $props();

	const widthInputId = $props.id();

	let operation = $state<'filter' | 'resize'>('filter');
	let filterPreset = $state('vivid');
	let width = $state(1200);
	let isProcessing = $state(false);
	let errorMessage = $state('');

	const presetOptions = [
		{ value: 'vivid', label: 'Vivid' },
		{ value: 'bw', label: 'B&W' },
		{ value: 'sepia', label: 'Sepia' },
		{ value: 'dramatic', label: 'Dramatic' }
	];

	async function runBatch() {
		if (isProcessing || selectedIds.size === 0) return;

		isProcessing = true;
		errorMessage = '';

		const ids = Array.from(selectedIds);

		try {
			const response = await fetch('/api/media/batch-process', {
				method: 'POST',
				headers: clientJsonHeaders(),
				body: JSON.stringify({
					ids,
					operation,
					params: operation === 'filter' ? { filterPreset } : { width: Number(width) }
				})
			});

			const payload = (await response.json().catch(() => null)) as {
				success?: boolean;
				message?: string;
				code?: string;
				data?: { processed?: number; failed?: number };
			} | null;

			if (!response.ok || !payload?.success) {
				errorMessage = payload?.message ?? `Batch processing failed (HTTP ${response.status}).`;
				toast.error(errorMessage);
				return;
			}

			const processed = payload.data?.processed ?? 0;
			const failed = payload.data?.failed ?? 0;

			if (failed > 0) {
				toast.warning(`Processed ${processed} of ${ids.length} assets — ${failed} failed.`);
			} else {
				toast.success(`Processed ${processed} ${processed === 1 ? 'asset' : 'assets'}.`);
			}

			if (processed > 0) {
				await refreshAll();
			}
			onClose();
		} catch (err) {
			logger.error('Batch processing request failed', err);
			errorMessage = 'Batch processing encountered an error.';
			toast.error(errorMessage);
		} finally {
			isProcessing = false;
		}
	}
</script>

<div class="pointer-events-none fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4">
	<div in:adminSlide={{ distance: 48 }}>
		<AdminCard
			id="media-batch-processor"
			class="pointer-events-auto mx-auto w-full max-w-4xl border border-(--admin-border-default) p-4 shadow-2xl sm:p-6"
			data-testid="batch-processor"
		>
			<div class="mb-4 flex items-center justify-between gap-3 sm:mb-6">
				<div class="flex min-w-0 items-center gap-3">
					<div
						class="flex size-10 shrink-0 items-center justify-center rounded-full bg-tertiary-500 font-bold text-white"
						aria-hidden="true"
					>
						{selectedIds.size}
					</div>
					<div class="min-w-0">
						<h3 class="truncate text-base font-bold sm:text-lg">
							{mediagallery_batch_processor()}
						</h3>
						<p
							class="truncate font-mono text-[10px] uppercase tracking-widest text-(--admin-text-muted)"
						>
							{mediagallery_batch_engine()}
						</p>
					</div>
				</div>
				<Button
					variant="surface"
					onclick={onClose}
					aria-label={button_close()}
					class="min-w-0 shrink-0 p-0!"
				>
					<iconify-icon icon="mdi:close" width="20"></iconify-icon>
				</Button>
			</div>

			<div class="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
				<!-- Step 1: Operation -->
				<div class="space-y-2">
					<span
						class="block text-[10px] font-bold uppercase tracking-widest text-(--admin-text-muted)"
					>
						{mediagallery_batch_select_action()}
					</span>
					<div
						class="flex gap-2 md:flex-col"
						role="group"
						aria-label={mediagallery_batch_select_action()}
					>
						<Button
							variant={operation === 'filter' ? 'primary' : 'surface'}
							onclick={() => (operation = 'filter')}
							size="sm"
							aria-pressed={operation === 'filter'}
							class="flex-1 justify-start gap-2 md:flex-none"
							data-testid="batch-operation-filter"
						>
							<iconify-icon icon="mdi:auto-fix" width="18"></iconify-icon>
							{mediagallery_batch_apply_filter()}
						</Button>
						<Button
							variant={operation === 'resize' ? 'primary' : 'surface'}
							onclick={() => (operation = 'resize')}
							size="sm"
							aria-pressed={operation === 'resize'}
							class="flex-1 justify-start gap-2 md:flex-none"
							data-testid="batch-operation-resize"
						>
							<iconify-icon icon="mdi:resize" width="18"></iconify-icon>
							{mediagallery_batch_resize()}
						</Button>
					</div>
				</div>

				<!-- Step 2: Params -->
				<div class="space-y-2 md:border-x md:border-(--admin-border-default) md:px-6">
					<span
						class="block text-[10px] font-bold uppercase tracking-widest text-(--admin-text-muted)"
					>
						{mediagallery_batch_configure()}
					</span>
					{#if operation === 'filter'}
						<Select
							label={mediagallery_batch_filter_preset()}
							bind:value={filterPreset}
							options={presetOptions}
							size="sm"
							placeholder=""
							data_testid="batch-filter-preset"
						/>
					{:else}
						<Input
							id={widthInputId}
							type="number"
							min={32}
							max={4096}
							step={1}
							bind:value={width}
							label="Width (px)"
							aria-label={mediagallery_batch_resize_width()}
							data-testid="batch-width"
						/>
					{/if}
				</div>

				<!-- Step 3: Run -->
				<div class="flex flex-col justify-end gap-2">
					{#if errorMessage}
						<p class="text-xs text-error-500" role="alert" data-testid="batch-error">
							{errorMessage}
						</p>
					{/if}
					<Button
						variant="primary"
						onclick={runBatch}
						disabled={isProcessing || selectedIds.size === 0}
						aria-busy={isProcessing}
						class="w-full gap-2"
						data-testid="batch-run"
					>
						{#if !isProcessing}
							<iconify-icon icon="mdi:play-circle" width="20"></iconify-icon>
						{/if}
						{mediagallery_batch_run()}
						{selectedIds.size}
						{mediagallery_batch_assets()}
					</Button>
				</div>
			</div>
		</AdminCard>
	</div>
</div>
