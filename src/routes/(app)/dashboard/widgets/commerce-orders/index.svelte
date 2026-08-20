<!--
@file src/routes/(app)/dashboard/widgets/commerce-orders/index.svelte
@component
**Commerce orders snapshot — recent orders and status mix (freemium, 14-day trial)**

### Props
- `label` (string): Widget label.
- `size` (WidgetSize): Compact when `h === 1`.

### Features:
- 14-day key-less trial via /api/system/license-status
- UpgradePrompt after trial without a marketplace key
- empty state when the orders collection is not installed
- recent order list with status chips
-->
<script lang="ts" module>
	export const widgetMeta = {
		name: 'Commerce Orders',
		icon: 'mdi:receipt-text-outline',
		description: 'Recent orders and status mix for the ecommerce preset',
		defaultSize: { w: 2, h: 2 }
	};
</script>

<script lang="ts">
	import type { WidgetSize } from '@src/content/types';
	import { formatRelativeDate } from '@utils/date';
	import UpgradePrompt from '@components/ui/upgrade-prompt.svelte';
	import BaseWidget from '../../base-widget.svelte';

	interface OrderRow {
		id: string;
		orderNumber: string;
		total: number;
		status: string;
		createdAt: string;
		customerEmail: string;
	}

	interface OrdersPayload {
		available: boolean;
		total: number;
		byStatus: Record<string, number>;
		recent: OrderRow[];
	}

	interface LicenseStatus {
		active?: boolean;
		hasLicense?: boolean;
		daysRemaining?: number | null;
	}

	const {
		label = 'Commerce Orders',
		theme = 'light' as 'light' | 'dark',
		icon = 'mdi:receipt-text-outline',
		widgetId = undefined as string | undefined,
		size = { w: 2, h: 2 } as WidgetSize,
		onSizeChange = ((_newSize: WidgetSize) => {}) as (newSize: WidgetSize) => void,
		onRemove = (() => {}) as () => void
	} = $props();

	let licenseStatus = $state<LicenseStatus | null>(null);

	$effect(() => {
		fetch('/api/system/license-status?type=dashboard&id=commerce-orders')
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

	function statusClass(status: string): string {
		switch (status) {
			case 'processing':
				return 'bg-emerald-500';
			case 'shipped':
			case 'delivered':
				return 'bg-sky-500';
			case 'cancelled':
			case 'refunded':
				return 'bg-rose-500';
			default:
				return 'bg-amber-500';
		}
	}

	function formatTotal(value: number): string {
		return Number.isFinite(value) ? value.toFixed(2) : '0.00';
	}
</script>

{#if trialLocked}
	<BaseWidget {label} {theme} {icon} {widgetId} {size} {onSizeChange} onCloseRequest={onRemove}>
		<UpgradePrompt
			extensionId="dashboard:commerce-orders"
			price="€12.99"
			title="Commerce Orders requires a license"
			message="Your 14-day trial has expired. A marketplace license is required to keep using this dashboard widget."
		/>
	</BaseWidget>
{:else}
	<BaseWidget
		{label}
		{theme}
		endpoint="/api/dashboard/commerce-orders"
		pollInterval={30000}
		{icon}
		{widgetId}
		{size}
		{onSizeChange}
		onCloseRequest={onRemove}
	>
		{#snippet children({ data })}
			{@const payload = data as OrdersPayload | null}
			{#if !payload}
				<div class="flex h-full items-center justify-center text-xs text-surface-500">Loading orders…</div>
			{:else if !payload.available}
				<div class="flex h-full flex-col items-center justify-center px-3 text-center">
					<iconify-icon icon="mdi:cart-off" class="mb-2 text-3xl text-surface-400"></iconify-icon>
					<p class="text-xs font-semibold text-surface-600 dark:text-surface-300">No orders collection</p>
					<p class="mt-1 text-[11px] text-surface-500">Enable the ecommerce Setup Wizard preset to see orders here.</p>
				</div>
			{:else if isCompact}
				<div class="flex h-full items-center gap-3 overflow-hidden px-1">
					<span class="text-lg font-bold tabular-nums text-surface-800 dark:text-surface-100">{payload.total}</span>
					<span class="text-xs text-surface-500">recent orders</span>
				</div>
			{:else}
				<div class="flex h-full min-h-0 flex-col gap-2">
					{#if trialDays !== null}
						<p class="text-[10px] text-amber-600 dark:text-amber-400">Trial · {trialDays} day{trialDays === 1 ? '' : 's'} remaining</p>
					{/if}
					<div class="flex flex-wrap gap-1.5">
						{#each Object.entries(payload.byStatus) as [status, count] (status)}
							<span class="inline-flex items-center gap-1 rounded-full bg-surface-100 px-2 py-0.5 text-[10px] font-medium text-surface-700 dark:bg-surface-800 dark:text-surface-200">
								<span class="h-1.5 w-1.5 rounded-full {statusClass(status)}"></span>
								{status} {count}
							</span>
						{/each}
					</div>
					<ul class="min-h-0 flex-1 space-y-1 overflow-y-auto" aria-label="Recent orders">
						{#each payload.recent as order (order.id)}
							<li class="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-xs hover:bg-surface-50 dark:hover:bg-surface-800/60">
								<div class="min-w-0">
									<div class="truncate font-medium text-surface-800 dark:text-surface-100">{order.orderNumber}</div>
									<div class="truncate text-[10px] text-surface-500">{order.customerEmail || 'guest'} · {order.createdAt ? formatRelativeDate(order.createdAt) : '—'}</div>
								</div>
								<div class="shrink-0 text-end">
									<div class="tabular-nums font-semibold">{formatTotal(order.total)}</div>
									<div class="text-[10px] capitalize text-surface-500">{order.status}</div>
								</div>
							</li>
						{:else}
							<li class="py-4 text-center text-[11px] text-surface-500">No orders yet</li>
						{/each}
					</ul>
				</div>
			{/if}
		{/snippet}
	</BaseWidget>
{/if}
