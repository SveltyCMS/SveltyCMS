<!--
@file src/routes/(app)/dashboard/base-widget.svelte
@component
**Base widget container with sandboxed data fetching, isolated storage, and interactive controls**

Features:
- Sandboxed data fetching with safe URL validation and CSRF protection
- Isolated namespaced client-side caching with TTL and quota guard
- Tab visibility gating and network online/offline awareness
- Global synchronized refresh coordination via dashboardEvents
- In-place configuration modal (title, refresh interval, dimensions)
- Maximize / fullscreen modal view for deep data inspection
- Dynamic keyboard & pointer resizing with responsive snap preview
- 100% backward-compatible with all existing SveltyCMS dashboard widgets
-->
<script lang="ts">
	import type { WidgetSize } from '@src/content/types';
	import { logger } from '@utils/logger';
	import Button from '@components/ui/button.svelte';
	import Badge from '@components/ui/badge.svelte';
	import Tooltip from '@components/ui/tooltip.svelte';
	import Modal from '@components/ui/modal.svelte';
	import { getThemeContext } from '@components/ui/theme-context.svelte';
	import { getContext, untrack, type Snippet } from 'svelte';
	import { shouldFetchOnVisibility, shouldSkipScheduledPoll } from './widget-runtime';
	import { sandboxedWidgetFetch, WidgetHttpError } from './widget-sandbox';
	import { dashboardEvents } from './widget-events.svelte';
	import WidgetSettingsModal from './widget-settings-modal.svelte';
	import { createWidgetSandbox } from './widget-sdk';
	import {
		WIDGET_SCOPE_KEY,
		type WidgetSandboxContext,
		type WidgetScopeContext
	} from './widget-contract';
	import {
		button_close,
		button_retry,
		dashboard_widget_access_denied,
		dashboard_widget_configure,
		dashboard_widget_expand,
		dashboard_widget_expanded,
		dashboard_widget_source,
		dashboard_widget_static,
		widget_base_loading,
		widget_base_no_content,
		widget_base_refresh_aria,
		widget_base_refresh_title,
		widget_base_remove_aria,
		widget_base_resize_aria,
		widget_base_resize_title,
		widget_base_retry,
		widget_base_size_aria,
		widget_base_snap_to,
		widget_license_freemium,
		widget_license_paid
	} from '@src/paraglide/messages';

	/**
	 * The snippet contract stays intentionally loose on `data`: each widget
	 * annotates its own payload type and Svelte cannot express a generic snippet
	 * across the dynamic widget boundary. Everything else is strictly typed.
	 */
	interface ChildSnippetProps {
		data: any;
		error?: string | null;
		getWidgetState: (key: string) => unknown;
		isLoading?: boolean;
		refresh?: () => Promise<void>;
		updateWidgetState: (key: string, value: unknown) => void;
		sandbox?: WidgetSandboxContext;
	}

	interface Props {
		label?: string;
		theme?: 'light' | 'dark';
		endpoint?: string;
		pollInterval?: number;
		widgetId?: string;
		icon?: string;
		children?: Snippet<[ChildSnippetProps]>;
		size?: WidgetSize;
		onSizeChange?: (newSize: WidgetSize) => void;
		resizable?: boolean;
		onCloseRequest?: () => void;
		initialData?: unknown;
		onDataLoaded?: (fetchedData: unknown) => void;
		showRefreshButton?: boolean;
		license?: 'free' | 'freemium' | 'paid';
		cacheKey?: string;
		cacheTTL?: number;
		retryCount?: number;
		retryDelay?: number;
		settings?: Record<string, unknown>;
		onSettingsChange?: (newSettings: Record<string, unknown>) => void;
		component?: string;
	}

	let {
		label = 'Widget',
		theme = 'light',
		endpoint = undefined,
		pollInterval = 0,
		widgetId = 'widget-default',
		icon = 'mdi:view-grid',
		children = undefined,
		size = { w: 1, h: 1 },
		onSizeChange = (_newSize: WidgetSize) => {},
		resizable = true,
		onCloseRequest = () => {},
		initialData: passedInitialData = undefined,
		onDataLoaded = (_fetchedData: unknown) => {},
		showRefreshButton = false,
		license: licenseProp = 'free',
		cacheKey = undefined,
		cacheTTL = 300_000,
		retryCount = 3,
		retryDelay = 1000,
		settings: settingsProp = {},
		onSettingsChange = undefined,
		component = 'unknown'
	}: Props = $props();

	const widgetScope = getContext<WidgetScopeContext | undefined>(WIDGET_SCOPE_KEY);
	/** Persisted settings win over the widget's hardcoded defaults (via the tile scope). */
	const settings = $derived(widgetScope?.settings ?? settingsProp);
	const accessAllowed = $derived(widgetScope?.accessAllowed ?? true);
	/** Manifest license from the tile scope; packages no longer need to forward it. */
	const license = $derived(widgetScope?.license ?? licenseProp);

	let widgetState = $state<Record<string, unknown>>({});
	let loading = $state(false);
	let error = $state<string | null>(null);
	let internalData = $state<unknown>(undefined);
	let lastFetchTime = $state<number>(0);
	let currentRetry = $state(0);
	let showSettingsModal = $state(false);
	let showMaximizeModal = $state(false);
	let customLabel = $state(untrack(() => label));
	let currentPollInterval = $state(
		untrack(() => {
			const persisted = widgetScope?.settings.pollInterval;
			return typeof persisted === 'number' ? persisted : pollInterval;
		})
	);

	// Sandbox context + namespaced, quota-managed storage scoped to the tile's tenant/user.
	const sandboxContext: WidgetSandboxContext = createWidgetSandbox(
		untrack(() => widgetId || 'default'),
		untrack(() => component),
		untrack(() => widgetScope?.tenantId ?? 'global'),
		untrack(() => widgetScope?.userId ?? 'anon'),
		{
			onRequestRefresh: refresh,
			onUpdateSettings: (patch) => onSettingsChange?.(patch),
			onNotify: (message, type) => {
				if (type === 'error') logger.error(`[${customLabel}] ${message}`);
				else if (type === 'warning') logger.warn(`[${customLabel}] ${message}`);
				else logger.info(`[${customLabel}] ${message}`);
			}
		}
	);
	const storage = sandboxContext.storage;

	/** Variant-aware chrome (flat/bordered/elevated) — same source as `AdminCard`. */
	const themeCtx = getThemeContext();

	$effect(() => {
		if (passedInitialData !== undefined) {
			internalData = passedInitialData;
		}
	});

	$effect(() => {
		customLabel = label;
	});

	$effect(() => {
		const persisted = settings.pollInterval;
		currentPollInterval = typeof persisted === 'number' ? persisted : pollInterval;
	});

	// Cache management with backward compatibility (read-only legacy migration;
	// new data is only written to the tenant/user/widget-scoped key).
	function getCachedData(): unknown | null {
		if (!cacheKey) return null;
		try {
			const sandboxed = storage.get(`cache_${cacheKey}`);
			if (sandboxed !== null && sandboxed !== undefined) return sandboxed;

			if (typeof localStorage !== 'undefined') {
				const legacy = localStorage.getItem(`widget_cache_${cacheKey}`);
				if (legacy) {
					const { data, timestamp } = JSON.parse(legacy);
					if (Date.now() - timestamp < cacheTTL) return data;
					localStorage.removeItem(`widget_cache_${cacheKey}`);
				}
			}
		} catch (e) {
			logger.warn(`Failed to read cache for ${customLabel}:`, e);
		}
		return null;
	}

	function setCachedData(data: unknown): void {
		if (!cacheKey) return;
		try {
			storage.set(`cache_${cacheKey}`, data, cacheTTL);
		} catch (e) {
			logger.warn(`Failed to write cache for ${customLabel}:`, e);
		}
	}

	// Sandboxed fetch with exponential backoff retry logic
	async function fetchData(retryAttempt = 0, skipLocalCache = false): Promise<void> {
		if (!endpoint || !accessAllowed) {
			loading = false;
			return;
		}

		// Check cache first on initial load
		if (retryAttempt === 0 && !skipLocalCache) {
			const cached = getCachedData();
			if (cached !== null && cached !== undefined) {
				internalData = cached;
				onDataLoaded(cached);
				loading = false;
				return;
			}
		}

		loading = true;
		error = null;
		currentRetry = retryAttempt;

		try {
			const newData = await sandboxedWidgetFetch<unknown>(endpoint);
			internalData = newData;
			lastFetchTime = Date.now();
			onDataLoaded(newData);
			setCachedData(newData);
			currentRetry = 0;
			error = null;
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : 'Failed to fetch data';
			const retryable = !(err instanceof WidgetHttpError) || err.retryable;

			// Retry transient failures with exponential backoff. A 4xx (e.g. 403
			// from the permission gate) will not succeed on retry and hammering it
			// only multiplies the rejection.
			if (retryAttempt < retryCount && retryable) {
				logger.warn(`[${customLabel}] Retry ${retryAttempt + 1}/${retryCount}:`, errorMsg);
				const delay = retryDelay * 2 ** retryAttempt;
				await new Promise((resolve) => setTimeout(resolve, delay));
				return fetchData(retryAttempt + 1, skipLocalCache);
			}

			error = errorMsg;
			logger.error(`[${customLabel}] Failed after ${currentRetry} attempts:`, error);
		} finally {
			loading = false;
		}
	}

	// Manual refresh function
	async function refresh(fromGlobal = false): Promise<void> {
		try {
			if (!accessAllowed) return;
			if (cacheKey) {
				storage.remove(`cache_${cacheKey}`);
			}
			currentRetry = 0;
			await fetchData();
		} finally {
			if (fromGlobal) dashboardEvents.widgetRefreshSettled();
		}
	}

	// Let the toolbar know when every mounted widget has finished refreshing.
	$effect(() => dashboardEvents.registerWidget());

	// Global "Refresh All" listener. `lastObservedRefreshTrigger` is deliberately
	// a plain variable: writing reactive state inside an effect re-runs it.
	let lastObservedRefreshTrigger = dashboardEvents.refreshTrigger;
	$effect(() => {
		const trigger = dashboardEvents.refreshTrigger;
		if (trigger > 0 && trigger !== lastObservedRefreshTrigger) {
			lastObservedRefreshTrigger = trigger;
			// Add micro-jitter (10-80ms) based on widgetId hash to avoid simultaneous burst
			const jitterMs =
				Math.abs((widgetId || 'w').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 70) +
				10;
			const timeoutId = setTimeout(() => {
				void refresh(true);
			}, jitterMs);
			return () => clearTimeout(timeoutId);
		}
	});

	// Effect for fetching data with polling (paused when tab hidden or offline)
	$effect(() => {
		if (!endpoint || !accessAllowed) {
			loading = false;
			return;
		}

		let isActive = true;
		let timerId: ReturnType<typeof setInterval> | undefined;

		if (isActive) {
			untrack(() => {
				void fetchData();
			});
		}

		if (currentPollInterval > 0) {
			timerId = setInterval(() => {
				if (!isActive) return;
				if (typeof navigator !== 'undefined' && !navigator.onLine) return;
				if (shouldSkipScheduledPoll(typeof document !== 'undefined' && document.hidden)) {
					return;
				}
				void fetchData(0, true);
			}, currentPollInterval);
		}

		const onVisibility = () => {
			if (!isActive) return;
			if (
				shouldFetchOnVisibility(
					typeof document !== 'undefined' && document.hidden,
					lastFetchTime,
					currentPollInterval,
					Date.now()
				)
			) {
				void fetchData(0, true);
			}
		};

		if (typeof document !== 'undefined') {
			document.addEventListener('visibilitychange', onVisibility);
		}

		return () => {
			isActive = false;
			if (timerId) clearInterval(timerId);
			if (typeof document !== 'undefined') {
				document.removeEventListener('visibilitychange', onVisibility);
			}
		};
	});

	// Widget state management
	function updateWidgetState(key: string, value: unknown) {
		widgetState = { ...widgetState, [key]: value };
	}

	function getWidgetState(key: string): unknown {
		return widgetState[key];
	}

	// UI helpers
	function getSizeLabel(s: WidgetSize): string {
		return `${s.w}×${s.h}`;
	}

	function getLastUpdateText(): string {
		if (!lastFetchTime) return '';
		const seconds = Math.floor((Date.now() - lastFetchTime) / 1000);
		if (seconds < 60) return `${seconds}s ago`;
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.floor(minutes / 60);
		return `${hours}h ago`;
	}

	// Resize and menu logic
	let widgetEl = $state<HTMLElement | undefined>(undefined);
	let showSizeMenu = $state(false);
	let isResizing = $state(false);
	let previewSize = $state<WidgetSize | null>(null);

	const availableSizes: WidgetSize[] = [
		{ w: 1, h: 1 },
		{ w: 2, h: 1 },
		{ w: 3, h: 1 },
		{ w: 4, h: 1 },
		{ w: 1, h: 2 },
		{ w: 2, h: 2 },
		{ w: 3, h: 2 },
		{ w: 4, h: 2 },
		{ w: 1, h: 3 },
		{ w: 2, h: 3 },
		{ w: 3, h: 3 },
		{ w: 4, h: 3 },
		{ w: 1, h: 4 },
		{ w: 2, h: 4 },
		{ w: 3, h: 4 },
		{ w: 4, h: 4 }
	];

	function handleResizePointerDown(e: PointerEvent) {
		if (!(resizable && widgetEl)) return;
		e.preventDefault();
		e.stopPropagation();

		const target = e.target as HTMLElement;
		const direction =
			target.dataset.direction ||
			target.closest('[data-direction]')?.getAttribute('data-direction');

		isResizing = true;
		const startX = e.clientX;
		const startY = e.clientY;
		const gridContainer = widgetEl.closest('.responsive-dashboard-grid') as HTMLElement;

		if (!gridContainer) {
			isResizing = false;
			return;
		}

		const gridGap = Number.parseFloat(getComputedStyle(gridContainer).gap) || 16;
		const gridCols = getComputedStyle(gridContainer)
			.gridTemplateColumns.split(' ')
			.filter(Boolean).length;
		const totalGapWidth = gridGap * (gridCols - 1);
		const singleColumnWidth = (gridContainer.offsetWidth - totalGapWidth) / gridCols;
		const singleRowHeight = dashboardEvents.density === 'compact' ? 120 : 160;

		const currentColumns = size.w;
		const currentRows = size.h;

		const handlePointerMove = (moveEvent: PointerEvent) => {
			const deltaX = moveEvent.clientX - startX;
			const deltaY = moveEvent.clientY - startY;

			let columnChange = 0;
			if (direction?.includes('e')) {
				columnChange = deltaX / (singleColumnWidth + gridGap);
			} else if (direction?.includes('w')) {
				columnChange = -deltaX / (singleColumnWidth + gridGap);
			}

			let rowChange = 0;
			if (direction?.includes('s')) {
				rowChange = deltaY / (singleRowHeight + gridGap);
			} else if (direction?.includes('n')) {
				rowChange = -deltaY / (singleRowHeight + gridGap);
			}

			const targetColumns = Math.round(currentColumns + columnChange);
			const targetRows = Math.round(currentRows + rowChange);

			const newColumns = Math.max(1, Math.min(gridCols, targetColumns));
			const newRows = Math.max(1, Math.min(4, targetRows));

			previewSize = { w: newColumns, h: newRows };
		};

		const handlePointerUp = () => {
			window.removeEventListener('pointermove', handlePointerMove);
			window.removeEventListener('pointerup', handlePointerUp);
			isResizing = false;
			if (previewSize && (previewSize.w !== size.w || previewSize.h !== size.h)) {
				onSizeChange(previewSize);
			}
			previewSize = null;
		};

		window.addEventListener('pointermove', handlePointerMove);
		window.addEventListener('pointerup', handlePointerUp, { once: true });
	}

	function handleMenuSizeChange(newSize: WidgetSize) {
		onSizeChange(newSize);
		showSizeMenu = false;
	}

	function handleClickOutside(event: MouseEvent) {
		if (showSizeMenu && widgetEl && !widgetEl.contains(event.target as Node)) {
			showSizeMenu = false;
		}
	}

	$effect(() => {
		if (showSizeMenu) {
			document.addEventListener('click', handleClickOutside);
		} else {
			document.removeEventListener('click', handleClickOutside);
		}
		return () => document.removeEventListener('click', handleClickOutside);
	});

	function handleSaveSettings(updated: {
		label: string;
		size: WidgetSize;
		pollInterval: number;
		settings: Record<string, unknown>;
	}) {
		customLabel = updated.label;
		currentPollInterval = updated.pollInterval;
		if (updated.size.w !== size.w || updated.size.h !== size.h) {
			onSizeChange(updated.size);
		}
		// Only send the fields this modal owns. The parent merges them into the
		// persisted settings, so widget-specific settings (collectionId, …) survive.
		onSettingsChange?.({
			customLabel: updated.label,
			pollInterval: updated.pollInterval
		});
	}
</script>

<article
	bind:this={widgetEl}
	class="widget-base-container group relative flex h-full flex-col border-solid border-(--admin-border-default) transition-all duration-150 focus-within:ring-2 focus-within:ring-primary-500/40"
	aria-labelledby="widget-title-{widgetId || customLabel}"
	style="overflow: visible; border-radius: var(--admin-radius-card, 0.75rem); border-width: {themeCtx?.cardBorder ??
		'var(--admin-border-width, 1px)'}; box-shadow: {themeCtx?.cardShadow ??
		'var(--admin-shadow-elevation, 0 1px 3px 0 rgb(0 0 0 / 0.1))'}; background-color: var(--admin-bg-card, var(--color-surface-50)); color: var(--admin-text-body, var(--color-surface-900));"
>
	<header
		class="widget-header flex cursor-grab items-center justify-between border-b border-(--admin-border-default) py-2 ps-3.5 pe-2"
		style="touch-action: none; overflow: visible; position: relative; z-index: 10;"
	>
		<div class="flex min-w-0 flex-1 flex-col gap-0.5">
			<h2
				id="widget-title-{widgetId || customLabel}"
				class="font-display flex items-center gap-2 truncate text-sm font-semibold tracking-tight"
			>
				<iconify-icon
					icon={icon || 'mdi:view-grid'}
					width={20}
					class={theme === 'light'
						? 'text-tertiary-500 shrink-0'
						: 'text-tertiary-500 dark:text-primary-500 shrink-0'}
				></iconify-icon>
				<span class="truncate">{customLabel}</span>
				{#if license === 'freemium'}
					<Badge variant="warning" size="sm" class="text-[9px] px-1.5 py-0 leading-tight shrink-0"
						>{widget_license_freemium()}</Badge
					>
				{:else if license === 'paid'}
					<Badge variant="primary" size="sm" class="text-[9px] px-1.5 py-0 leading-tight shrink-0"
						>{widget_license_paid()}</Badge
					>
				{/if}
			</h2>

			{#if endpoint && lastFetchTime && showRefreshButton}
				<div class="flex items-center gap-2 text-[11px] text-(--admin-text-muted)">
					<span>{getLastUpdateText()}</span>
					{#if loading}
						<span class="flex items-center gap-1">
							<iconify-icon
								icon="mdi:refresh"
								width={10}
								class="animate-spin text-tertiary-500 dark:text-primary-500"
							></iconify-icon>
							{#if currentRetry > 0}
								<span>{widget_base_retry({ current: currentRetry, total: retryCount })}</span>
							{/if}
						</span>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Widget Header Actions -->
		<div class="flex items-center gap-0.5">
			<!-- Manual Refresh -->
			<Tooltip title={widget_base_refresh_title()} positioning={{ placement: 'top' }}>
				<Button
					variant="ghost"
					onclick={() => refresh()}
					aria-label={widget_base_refresh_aria()}
					disabled={loading}
					class="p-0! min-w-0 h-7 w-7 text-(--admin-text-muted) hover:text-(--admin-text-body)"
				>
					<iconify-icon icon="mdi:refresh" width={15} class={loading ? 'animate-spin' : ''}
					></iconify-icon>
				</Button>
			</Tooltip>

			<!-- Fullscreen / Zoom -->
			<Tooltip title={dashboard_widget_expand()} positioning={{ placement: 'top' }}>
				<Button
					variant="ghost"
					onclick={() => (showMaximizeModal = true)}
					aria-label={dashboard_widget_expand()}
					class="p-0! min-w-0 h-7 w-7 text-(--admin-text-muted) hover:text-(--admin-text-body)"
				>
					<iconify-icon icon="mdi:fullscreen" width={15}></iconify-icon>
				</Button>
			</Tooltip>

			<!-- Settings / Configure -->
			<Tooltip title={dashboard_widget_configure()} positioning={{ placement: 'top' }}>
				<Button
					variant="ghost"
					onclick={() => (showSettingsModal = true)}
					aria-label={dashboard_widget_configure()}
					class="p-0! min-w-0 h-7 w-7 text-(--admin-text-muted) hover:text-(--admin-text-body)"
				>
					<iconify-icon icon="mdi:cog-outline" width={15}></iconify-icon>
				</Button>
			</Tooltip>

			<!-- Size Dropdown -->
			<div class="relative" style="overflow: visible;">
				<Tooltip title={widget_base_size_aria()} positioning={{ placement: 'top' }}>
					<Button
						variant="ghost"
						onclick={() => (showSizeMenu = !showSizeMenu)}
						aria-label={widget_base_size_aria()}
						class="p-0! min-w-0 h-7 w-7 text-(--admin-text-muted) hover:text-(--admin-text-body)"
					>
						<iconify-icon icon="mdi:dots-vertical" width={16}></iconify-icon>
					</Button>
				</Tooltip>
				{#if showSizeMenu}
					<div
						class="absolute inset-e-0 top-full z-50 mt-1 w-48 rounded-(--admin-radius-card) border border-(--admin-border-default) bg-(--admin-bg-card,var(--color-surface-50)) py-1 shadow-2xl dark:bg-surface-900"
						style="z-index: 9999;"
					>
						{#each availableSizes as s (s.w + 'x' + s.h)}
							<Button
								variant="ghost"
								class="flex w-full items-center justify-between px-3 py-1.5 text-xs transition-colors hover:bg-surface-500/10 {size.w ===
									s.w && size.h === s.h
									? 'font-bold text-tertiary-500 dark:text-primary-500'
									: 'text-(--admin-text-body)'}"
								onclick={() => handleMenuSizeChange(s)}
							>
								<span>{getSizeLabel(s)}</span>
								{#if size.w === s.w && size.h === s.h}
									<iconify-icon
										icon="mdi:check"
										width={14}
										class="text-tertiary-500 dark:text-primary-500"
									></iconify-icon>
								{/if}
							</Button>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Remove Widget -->
			<Tooltip
				title={widget_base_remove_aria({ label: customLabel })}
				positioning={{ placement: 'top' }}
			>
				<Button
					variant="ghost"
					onclick={onCloseRequest}
					aria-label={widget_base_remove_aria({ label: customLabel })}
					class="p-0! min-w-0 h-7 w-7 text-(--admin-text-muted) hover:text-error-500"
				>
					<iconify-icon icon="mdi:close" width={16}></iconify-icon>
				</Button>
			</Tooltip>
		</div>
	</header>

	<!-- Widget Content Body -->
	<section
		class="widget-body relative min-h-0 flex-1 overflow-y-auto px-3 pb-2 pt-1"
		style="width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: stretch; align-items: stretch;"
	>
		<div aria-live="polite" class="contents">
			{#if !accessAllowed}
				<div
					class="access-denied absolute inset-0 flex flex-col items-center justify-center p-3 text-center text-sm text-warning-500"
				>
					<iconify-icon icon="mdi:shield-lock-outline" width={28} class="mb-1"></iconify-icon>
					<span class="font-medium">{dashboard_widget_access_denied()}</span>
				</div>
			{:else if showMaximizeModal}
				<div
					class="text-(--admin-text-muted) absolute inset-0 flex items-center justify-center text-sm"
				>
					{dashboard_widget_expanded()}
				</div>
			{:else if endpoint && loading && !internalData}
				<div
					class="loading-state text-(--admin-text-muted) absolute inset-0 flex items-center justify-center text-sm"
				>
					<iconify-icon
						icon="mdi:loading"
						width={20}
						class="animate-spin me-2 text-tertiary-500 dark:text-primary-500"
					></iconify-icon>
					{widget_base_loading()}
				</div>
			{:else if endpoint && error && !internalData}
				<div
					class="error-state absolute inset-0 flex flex-col items-center justify-center p-3 text-center text-sm text-error-500"
				>
					<iconify-icon icon="mdi:alert-circle" width={28} class="mb-1"></iconify-icon>
					<span class="font-medium">{error}</span>
					<Button variant="ghost" size="sm" onclick={() => refresh()} class="mt-2 text-xs">
						{button_retry()}
					</Button>
				</div>
			{:else if children}
				{@render children({
					data: internalData,
					updateWidgetState,
					getWidgetState,
					refresh,
					isLoading: loading,
					error,
					sandbox: sandboxContext
				})}
			{:else if internalData}
				<pre
					class="text-(--admin-text-body) whitespace-pre-wrap break-all text-xs"
					style="width: 100%; height: 100%;">{JSON.stringify(internalData, null, 2)}</pre>
			{:else}
				<div
					class="text-(--admin-text-muted) absolute inset-0 flex items-center justify-center text-sm"
				>
					{widget_base_no_content()}
				</div>
			{/if}
		</div>
	</section>

	<!-- Resize Handles -->
	{#if resizable}
		<div class="resize-handles pointer-events-none absolute inset-0">
			{#each [{ dir: 'nw', classes: 'top-0 inset-s-0 cursor-nw-resize', icon: 'clarity:drag-handle-corner-line', rotation: 'rotate-180' }, { dir: 'n', classes: 'top-0 inset-s-1/2 cursor-n-resize', icon: 'mdi:drag-vertical', style: 'transform: translateX(-50%) rotate(90deg);', rotation: '' }, { dir: 'ne', classes: 'top-0 end-0 cursor-ne-resize', icon: 'clarity:drag-handle-corner-line', rotation: '-rotate-90' }, { dir: 'e', classes: 'top-1/2 end-0 cursor-e-resize', icon: 'mdi:drag-vertical', style: 'transform: translateY(-50%) rotate(180deg);', rotation: '' }, { dir: 'se', classes: 'bottom-0 end-0 cursor-se-resize', icon: 'clarity:drag-handle-corner-line', rotation: '' }, { dir: 's', classes: 'bottom-0 inset-s-1/2 cursor-s-resize', icon: 'mdi:drag-vertical', style: 'transform: translateX(-50%) rotate(90deg);', rotation: '' }, { dir: 'sw', classes: 'bottom-0 inset-s-0 cursor-sw-resize', icon: 'clarity:drag-handle-corner-line', rotation: 'rotate-90' }, { dir: 'w', classes: 'top-1/2 inset-s-0 cursor-w-resize', icon: 'mdi:drag-vertical', style: 'transform: translateY(-50%) rotate(180deg);', rotation: '' }] as handle (handle.dir)}
				<div
					class="pointer-events-auto absolute z-20 flex items-center justify-center opacity-0 transition-all duration-200 hover:scale-125 hover:opacity-100 group-hover:opacity-60 {handle.classes} {handle.rotation}"
					style="width: 16px; height: 16px; {handle.style || ''}"
					data-direction={handle.dir}
					title={widget_base_resize_title({ dir: handle.dir })}
					aria-label={widget_base_resize_aria({ dir: handle.dir })}
					onpointerdown={handleResizePointerDown}
					role="button"
					tabindex="0"
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
						}
					}}
				>
					<iconify-icon icon="mdi:drag-vertical" width={12} class="text-(--admin-text-muted)"
					></iconify-icon>
				</div>
			{/each}
		</div>
	{/if}

	{#if isResizing && previewSize}
		<div
			class="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded bg-tertiary-500/10 dark:bg-primary-500/10 backdrop-blur-sm"
		>
			<div
				class="rounded bg-tertiary-500 px-3 py-1.5 text-xs font-semibold text-white shadow-lg dark:bg-primary-500"
			>
				{widget_base_snap_to({ size: getSizeLabel(previewSize) })}
			</div>
		</div>
	{/if}
</article>

<!-- In-Place Settings Modal -->
<WidgetSettingsModal
	bind:open={showSettingsModal}
	label={customLabel}
	{size}
	pollInterval={currentPollInterval}
	{settings}
	onSave={handleSaveSettings}
/>

<!-- Fullscreen / Expanded Inspection Modal (content mounts only while open) -->
{#if showMaximizeModal}
	<Modal bind:open={showMaximizeModal} title={customLabel} size="xl" color="surface">
		<div class="min-h-96 p-4">
			{#if children}
				{@render children({
					data: internalData,
					updateWidgetState,
					getWidgetState,
					refresh,
					isLoading: loading,
					error,
					sandbox: sandboxContext
				})}
			{:else if internalData}
				<pre class="whitespace-pre-wrap break-all text-xs font-mono">{JSON.stringify(
						internalData,
						null,
						2
					)}</pre>
			{:else}
				<p class="text-sm text-(--admin-text-muted)">{widget_base_no_content()}</p>
			{/if}
		</div>
		{#snippet footer()}
			<div class="flex items-center justify-between w-full">
				<span class="text-xs text-(--admin-text-muted)">
					{endpoint ? `${dashboard_widget_source()} ${endpoint}` : dashboard_widget_static()}
				</span>
				<Button variant="ghost" onclick={() => (showMaximizeModal = false)}>{button_close()}</Button
				>
			</div>
		{/snippet}
	</Modal>
{/if}
