<!--
@file src/routes/(app)/dashboard/widgets/commerce-inventory/index.svelte
@component
**Commerce inventory — low-stock products (freemium, 14-day trial)**

### Props
- `label` (string): Widget label.
- `size` (WidgetSize): Compact when `h === 1`.

### Features:
- 14-day key-less trial via /api/system/license-status
- UpgradePrompt after trial without a marketplace key
- variant-aware quantity (preset `inventory` + import aliases)
- empty state when products collection is missing
-->
<script lang="ts" module>
	export const widgetMeta = {
		name: 'Commerce Inventory',
		icon: 'mdi:warehouse',
		description: 'Low-stock and out-of-stock products, including variant quantities',
		defaultSize: { w: 1, h: 2 }
	};
</script>

<script lang="ts">
	import type { WidgetSize } from '@src/content/types';
	import UpgradePrompt from '@components/ui/upgrade-prompt.svelte';
	import BaseWidget from '../../base-widget.svelte';

	interface StockRow {
		id: string;
		title: string;
		sku: string;
		qty: number;
		threshold: number;
	}

	interface InventoryPayload {
		available: boolean;
		tracked: number;
		outOfStock: number;
		lowStock: StockRow[];
	}

	interface LicenseStatus {
		active?: boolean;
		hasLicense?: boolean;
		daysRemaining?: number | null;
	}

	const {
		label = 'Commerce Inventory',
		theme = 'light' as 'light' | 'dark',
		icon = 'mdi:warehouse',
		widgetId = undefined as string | undefined,
		size = { w: 1, h: 2 } as WidgetSize,
		onSizeChange = ((_newSize: WidgetSize) => {}) as (newSize: WidgetSize) => void,
		onRemove = (() => {}) as () => void
	} = $props();

	let licenseStatus = $state<LicenseStatus | null>(null);

	$effect(() => {
		fetch('/api/system/license-status?type=dashboard&id=commerce-inventory')
			.then((res) => res.json())
			.then((data) => {
				licenseStatus = data;
			})
			.catch(() => {
				licenseStatus = { active: false, hasLicense: false, daysRemaining: 0 };
			});
	});

	const isCompact = $derived(size.h === 1);
	const trialLocked = $derived(Boolean(licenseStatus && !licenseStatus.active && !licenseStatus.hasLicense));
	const trialDays = $derived(
		licenseStatus?.active && !licenseStatus.hasLicense && typeof licenseStatus.daysRemaining === 'number'
			? licenseStatus.daysRemaining
			: null
	);
</script>

{#if trialLocked}
	<BaseWidget {label} {theme} {icon} {widgetId} {size} {onSizeChange} onCloseRequest={onRemove}>
		<UpgradePrompt
			extensionId="dashboard:commerce-inventory"
			price="€12.99"
			title="Commerce Inventory requires a license"
			message="Your 14-day trial has expired. A marketplace license is required to keep using this dashboard widget."
		/>
	</BaseWidget>
{:else}
	<BaseWidget
		{label}
		{theme}
		endpoint="/api/dashboard/commerce-inventory"
		pollInterval={60000}
		{icon}
		{widgetId}
		{size}
		{onSizeChange}
		onCloseRequest={onRemove}
	>
		{#snippet children({ data })}
			{@const payload = data as InventoryPayload | null}
			{#if !payload}
				<div class="flex h-full items-center justify-center text-xs text-surface-500">Loading stock…</div>
			{:else if !payload.available}
				<div class="flex h-full flex-col items-center justify-center px-3 text-center">
					<iconify-icon icon="mdi:package-variant-closed-remove" class="mb-2 text-3xl text-surface-400"></iconify-icon>
					<p class="text-xs font-semibold text-surface-600 dark:text-surface-300">No products collection</p>
					<p class="mt-1 text-[11px] text-surface-500">Enable the ecommerce Setup Wizard preset to track stock.</p>
				</div>
			{:else if isCompact}
				<div class="flex h-full items-center gap-2 overflow-hidden px-1 text-xs">
					<span class="font-bold tabular-nums text-rose-500">{payload.outOfStock}</span>
					<span class="text-surface-500">out of stock</span>
					<span class="text-surface-300">·</span>
					<span class="font-bold tabular-nums">{payload.lowStock.length}</span>
					<span class="text-surface-500">low</span>
				</div>
			{:else}
				<div class="flex h-full min-h-0 flex-col gap-2">
					{#if trialDays !== null}
						<p class="text-[10px] text-amber-600 dark:text-amber-400">Trial · {trialDays} day{trialDays === 1 ? '' : 's'} remaining</p>
					{/if}
					<div class="flex gap-3 text-[11px] text-surface-600 dark:text-surface-300">
						<span><strong class="tabular-nums">{payload.tracked}</strong> tracked</span>
						<span><strong class="tabular-nums text-rose-500">{payload.outOfStock}</strong> out</span>
					</div>
					<ul class="min-h-0 flex-1 space-y-1 overflow-y-auto" aria-label="Low stock products">
						{#each payload.lowStock as row (row.id)}
							<li class="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-xs hover:bg-surface-50 dark:hover:bg-surface-800/60">
								<div class="min-w-0">
									<div class="truncate font-medium text-surface-800 dark:text-surface-100">{row.title}</div>
									<div class="truncate font-mono text-[10px] text-surface-500">{row.sku || 'no sku'}</div>
								</div>
								<div class="shrink-0 text-end tabular-nums {row.qty <= 0 ? 'text-rose-500' : 'text-amber-600'}">
									{row.qty} / {row.threshold}
								</div>
							</li>
						{:else}
							<li class="py-4 text-center text-[11px] text-surface-500">Stock looks healthy</li>
						{/each}
					</ul>
				</div>
			{/if}
		{/snippet}
	</BaseWidget>
{/if}
