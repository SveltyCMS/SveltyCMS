<!--
@file src/routes/(app)/dashboard/BaseWidget.svelte
@component
**Base widget component providing common functionality for all dashboard widgets**

### Props
- `label`: The widget's display label (required)
- `theme`: Current theme ('light' or 'dark', default: 'light')
- `endpoint`: API endpoint for data fetching
- `pollInterval`: Data refresh interval in milliseconds (default: 0)
- `data`: Bindable data property for widget content
- `widgetId`: Unique identifier for widget state persistence
- `icon`: Optional icon for the widget
- `children`: Slot for widget-specific content
- `onDataLoaded`: Callback when data is successfully loaded
- `gridCellWidth`: Grid cell width (bindable)
- `ROW_HEIGHT`: Grid row height (bindable)
- `GAP_SIZE`: Grid gap size (bindable)
- `resizable`: Whether widget is resizable (default: true)
- `onResizeCommitted`: Callback when resize completes
- `onCloseRequest`: Callback when close is requested
- `initialData`: Initial data before fetch completes

### Features:
- Common properties for all widgets
- State management using Svelte 5 runes
- Polling effect for real-time data updates
- Widget state persistence
- Error handling and logging
- Improved resize handles with visual indicators
-->

<script lang="ts">
	import type { Snippet } from 'svelte';

	type ChildSnippetProps = {
		data: any;
		updateWidgetState: (key: string, value: any) => void;
		getWidgetState: (key: string) => any;
	};

	const {
		label = 'Widget',
		theme = 'light',
		icon = undefined,
		endpoint = undefined,
		pollInterval = 0,
		widgetId = undefined,
		children = undefined as Snippet<ChildSnippetProps> | undefined,
		currentSize = '1/4' as '1/4' | '1/2' | '3/4' | 'full',
		availableSizes = ['1/4', '1/2', '3/4', 'full'] as ('1/4' | '1/2' | '3/4' | 'full')[],
		onSizeChange = (_newSize: '1/4' | '1/2' | '3/4' | 'full') => {},
		rowSpan = 1,
		onRowSpanChange = (_newRowSpan: number) => {},
		draggable = true,
		onDragStart = (_event: MouseEvent | TouchEvent, _item: any, _element: HTMLElement) => {},
		gridCellWidth = $bindable(0),
		ROW_HEIGHT = $bindable(0),
		GAP_SIZE = $bindable(0),
		resizable = true,
		onResizeCommitted = () => {},
		onCloseRequest = () => {},
		initialData: passedInitialData = undefined,
		onDataLoaded = (_fetchedData: any) => {},
		data = $bindable(undefined),
		...rest
	} = $props<{
		label: string;
		theme?: 'light' | 'dark';
		icon?: string;
		endpoint?: string;
		pollInterval?: number;
		widgetId?: string;
		children?: Snippet<ChildSnippetProps>;
		currentSize?: '1/4' | '1/2' | '3/4' | 'full';
		availableSizes?: ('1/4' | '1/2' | '3/4' | 'full')[];
		onSizeChange?: (newSize: '1/4' | '1/2' | '3/4' | 'full') => void;
		rowSpan?: number;
		onRowSpanChange?: (newRowSpan: number) => void;
		draggable?: boolean;
		onDragStart?: (event: MouseEvent | TouchEvent, item: any, element: HTMLElement) => void;
		gridCellWidth: number;
		ROW_HEIGHT: number;
		GAP_SIZE: number;
		resizable?: boolean;
		onResizeCommitted?: (spans: { w: number; h: number }) => void;
		onCloseRequest?: () => void;
		initialData?: any;
		data?: any;
		onDataLoaded?: (fetchedData: any) => void;
		[key: string]: any;
	}>();

	let initialDataSet = false;
	let widgetState = $state<Record<string, any>>({});
	let loading = $state(endpoint && !passedInitialData);
	let error = $state<string | null>(null);
	let internalData = $state(passedInitialData);

	$effect(() => {
		if (passedInitialData !== undefined && !initialDataSet) {
			internalData = passedInitialData;
			initialDataSet = true;
		}
	});

	$effect(() => {
		if (!endpoint) {
			loading = false;
			return;
		}
		let isActive = true;
		let timerId: NodeJS.Timeout;
		const fetchData = async () => {
			if (!isActive) return;
			loading = true;
			error = null;
			try {
				const res = await fetch(`${endpoint}?_=${Date.now()}`);
				if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
				const newData = await res.json();
				if (isActive) {
					internalData = newData;
					onDataLoaded(newData);
				}
			} catch (err) {
				if (isActive) {
					error = err instanceof Error ? err.message : 'Failed to fetch data';
					console.error(`Error fetching data for ${label}:`, error);
				}
			} finally {
				if (isActive) loading = false;
			}
		};
		fetchData();
		if (pollInterval > 0) timerId = setInterval(fetchData, pollInterval);
		return () => {
			isActive = false;
			clearInterval(timerId);
		};
	});

	let widgetEl: HTMLDivElement | undefined = $state();
	let resizing = $state(false);
	let resizeDir: string | null = $state(null);
	let startPointer = { x: 0, y: 0 };
	let startDimensions = { w: 0, h: 0 };
	let currentPixelDimensions = $state({ w: 0, h: 0 });
	let previewSize = $state<'1/4' | '1/2' | '3/4' | 'full'>('1/4');

	function handleResizePointerDown(e: PointerEvent, dir: string) {
		if (!resizable || !widgetEl) return;
		e.preventDefault();
		e.stopPropagation();
		resizing = true;
		resizeDir = dir;
		startPointer = { x: e.clientX, y: e.clientY };
		startDimensions = { w: widgetEl.offsetWidth, h: widgetEl.offsetHeight };
		currentPixelDimensions = { ...startDimensions };
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
		window.addEventListener('pointermove', handleResizePointerMove);
		window.addEventListener('pointerup', handleResizePointerUp);
	}
	function handleResizePointerMove(e: PointerEvent) {
		if (!resizing || !widgetEl || !resizeDir) return;
		e.preventDefault();
		const deltaX = e.clientX - startPointer.x;
		const deltaY = e.clientY - startPointer.y;
		let newW = startDimensions.w;
		let newH = startDimensions.h;
		if (resizeDir.includes('e')) newW += deltaX;
		if (resizeDir.includes('w')) newW -= deltaX;
		if (resizeDir.includes('s')) newH += deltaY;
		if (resizeDir.includes('n')) newH -= deltaY;
		const gridContainer = widgetEl.parentElement?.parentElement;
		const gridWidth = gridContainer?.offsetWidth || 1200;
		const gridGap = GAP_SIZE || 16;
		const gridCols = 4;
		const rowHeight = ROW_HEIGHT || 200;
		const totalGapWidth = gridGap * (gridCols - 1);
		const availableGridWidth = gridWidth - totalGapWidth;
		const singleColumnWidth = availableGridWidth / gridCols;
		const minVisualPx = singleColumnWidth * 0.8;
		const maxVisualPx = gridWidth;
		currentPixelDimensions = {
			w: Math.max(minVisualPx, Math.min(maxVisualPx, newW)),
			h: Math.max(50, newH)
		};
		const currentWidth = currentPixelDimensions.w;
		const columnEquivalent = currentWidth / (singleColumnWidth + gridGap);
		const rowEquivalent = currentPixelDimensions.h / (rowHeight + gridGap);
		if (columnEquivalent < 1.3) previewSize = '1/4';
		else if (columnEquivalent < 2.3) previewSize = '1/2';
		else if (columnEquivalent < 3.3) previewSize = '3/4';
		else previewSize = 'full';
		widgetEl.style.width = `${currentPixelDimensions.w}px`;
		widgetEl.style.height = `${currentPixelDimensions.h}px`;
		widgetEl.style.opacity = '0.8';
		const rowSpanPreview = Math.max(1, Math.min(4, Math.round(rowEquivalent)));
		widgetEl.setAttribute('data-row-span-preview', rowSpanPreview.toString());
	}
	function handleResizePointerUp(e: PointerEvent) {
		if (!resizing || !widgetEl) {
			resizing = false;
			return;
		}
		(e.target as HTMLElement).releasePointerCapture(e.pointerId);
		window.removeEventListener('pointermove', handleResizePointerMove);
		window.removeEventListener('pointerup', handleResizePointerUp);
		const gridContainer = widgetEl.parentElement?.parentElement;
		const gridWidth = gridContainer?.offsetWidth || 1200;
		const gridGap = 16;
		const gridCols = 4;
		const totalGapWidth = gridGap * (gridCols - 1);
		const availableGridWidth = gridWidth - totalGapWidth;
		const singleColumnWidth = availableGridWidth / gridCols;
		const finalWidth = currentPixelDimensions.w;
		const finalHeight = currentPixelDimensions.h;
		const columnEquivalent = finalWidth / (singleColumnWidth + gridGap);
		const rowEquivalent = finalHeight / (ROW_HEIGHT + gridGap);
		let newSize: '1/4' | '1/2' | '3/4' | 'full';
		let newRowSpan = rowSpan;
		if (columnEquivalent < 1.3) newSize = '1/4';
		else if (columnEquivalent < 2.3) newSize = '1/2';
		else if (columnEquivalent < 3.3) newSize = '3/4';
		else newSize = 'full';
		newRowSpan = Math.max(1, Math.min(4, Math.round(rowEquivalent)));
		onSizeChange(newSize);
		onRowSpanChange(newRowSpan);
		widgetEl.style.width = '';
		widgetEl.style.height = '';
		widgetEl.style.opacity = '';
		resizing = false;
		resizeDir = null;
	}
	$effect(() => () => {
		window.removeEventListener('pointermove', handleResizePointerMove);
		window.removeEventListener('pointerup', handleResizePointerUp);
	});
	function updateWidgetState(key: string, value: any) {
		widgetState = { ...widgetState, [key]: value };
	}
	function getWidgetState(key: string) {
		return widgetState[key];
	}
	function getSizeIcon(size: '1/4' | '1/2' | '3/4' | 'full'): string {
		switch (size) {
			case '1/4':
				return 'mdi:view-column';
			case '1/2':
				return 'mdi:view-list';
			case '3/4':
				return 'mdi:view-grid';
			case 'full':
				return 'mdi:view-dashboard';
			default:
				return 'mdi:view-column';
		}
	}
	function getSizeLabel(size: '1/4' | '1/2' | '3/4' | 'full'): string {
		switch (size) {
			case '1/4':
				return 'Small (1/4)';
			case '1/2':
				return 'Medium (1/2)';
			case '3/4':
				return 'Large (3/4)';
			case 'full':
				return 'Full Width';
			default:
				return 'Small (1/4)';
		}
	}
	function handleSizeChange(newSize: '1/4' | '1/2' | '3/4' | 'full') {
		onSizeChange(newSize);
	}
	function handleHeaderMouseDown(event: MouseEvent | TouchEvent) {
		if (!draggable) return;
		const target = event.target as HTMLElement;
		if (target.closest('button') || target.closest('input') || target.closest('select') || target.closest('a')) return;
		onDragStart(event, { id: widgetId, size: currentSize, label, component: 'BaseWidget' }, widgetEl!);
	}
	const handleOffset = '-translate-x-1/2 -translate-y-1/2';
</script>

<article
	bind:this={widgetEl}
	class="widget-container text-text-900 dark:text-text-100 group relative flex h-full flex-col rounded-lg border border-surface-200 bg-white shadow-sm transition-all duration-150 dark:border-surface-700 dark:bg-surface-800 {resizing
		? 'scale-[1.01] shadow-md ring-2 ring-primary-300/60'
		: 'hover:shadow-md'} focus-within:ring-2 focus-within:ring-primary-200"
	style="user-select: {resizing ? 'none' : 'auto'};"
	aria-labelledby="widget-title-{widgetId || label}"
>
	<header
		class="widget-header flex items-center justify-between border-b border-gray-100 bg-white py-2 pl-4 pr-2 dark:border-surface-700 dark:bg-surface-800"
		onmousedown={handleHeaderMouseDown}
		ontouchstart={handleHeaderMouseDown}
		style="cursor: {draggable ? 'grab' : 'default'}; touch-action: none;"
		role="button"
		tabindex="0"
		aria-label="Drag to move {label} widget"
	>
		<h2
			id="widget-title-{widgetId || label}"
			class="text-text-900 dark:text-text-100 flex items-center gap-2 truncate font-display text-base font-semibold tracking-tight"
		>
			{#if icon}
				<iconify-icon {icon} width="20" class={theme === 'light' ? 'text-tertiary-600' : 'text-primary-400'}></iconify-icon>
			{/if}
			<span class="truncate">{label}</span>
		</h2>
		<div class="flex items-center gap-2">
			<div class="flex items-center gap-1 rounded-lg bg-gray-100 p-1.5 dark:bg-surface-600/80">
				{#each availableSizes as size}
					{@const isActive = currentSize === size}
					{@const sizeIcon = getSizeIcon(size)}
					<button
						onclick={() => handleSizeChange(size)}
						class="flex h-8 w-8 items-center justify-center rounded-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-400 {isActive
							? 'scale-105 bg-primary-500 text-white shadow-md'
							: 'text-text-500 dark:text-text-300 hover:bg-gray-200 hover:text-primary-600 dark:hover:bg-surface-500 dark:hover:text-primary-400'}"
						title={getSizeLabel(size)}
						aria-label="Resize widget to {getSizeLabel(size)}"
						data-size={size}
						data-active={isActive}
					>
						<div class="flex items-center gap-0.5">
							{#each Array(4) as _, i}
								{@const shouldHighlight =
									(size === '1/4' && i === 0) || (size === '1/2' && i < 2) || (size === '3/4' && i < 3) || (size === 'full' && i < 4)}
								<div
									class="h-3 w-0.5 rounded-full transition-all duration-200 {shouldHighlight
										? isActive
											? 'bg-white'
											: 'bg-current'
										: 'bg-gray-300 dark:bg-gray-600'}"
								></div>
							{/each}
						</div>
					</button>
				{/each}
			</div>
			<button
				onclick={onCloseRequest}
				class="text-text-400 btn-icon hover:text-error-500 focus:outline-none focus:ring-2 focus:ring-error-400"
				aria-label="Remove {label} widget"
			>
				<iconify-icon icon="mdi:close" width="18"></iconify-icon>
			</button>
		</div>
	</header>
	<section
		class="widget-body relative min-h-[50px] flex-1 bg-white px-5 py-4 dark:bg-surface-800"
		style="width: 100%; height: 100%; overflow: hidden; display: flex; flex-direction: column; justify-content: stretch; align-items: stretch;"
	>
		{#if endpoint && loading && !internalData}
			<div class="loading-state text-text-400 absolute inset-0 flex items-center justify-center text-base">Loading...</div>
		{:else if endpoint && error && !internalData}
			<div class="error-state absolute inset-0 flex flex-col items-center justify-center p-2 text-center text-base text-error-500">
				<iconify-icon icon="mdi:alert-circle-outline" width="24" class="mb-1"></iconify-icon>
				<span>{error}</span>
			</div>
		{:else if children}
			{@render children({ data: internalData, updateWidgetState, getWidgetState })}
		{:else if internalData}
			<pre class="text-text-700 dark:text-text-200 whitespace-pre-wrap break-all text-sm" style="width: 100%; height: 100%;">{JSON.stringify(
					internalData,
					null,
					2
				)}</pre>
		{:else}
			<div class="text-text-400 absolute inset-0 flex items-center justify-center text-base">No content.</div>
		{/if}
	</section>
	{#if resizable}
		<div
			class="absolute bottom-0 right-0 z-10 cursor-se-resize opacity-0 transition-all duration-200 hover:scale-125 hover:opacity-100"
			onpointerdown={(e) => handleResizePointerDown(e, 'se')}
			title="Drag to resize widget"
			aria-label="Drag to resize widget"
		>
			<div class="rounded-tl-lg bg-primary-500/90 p-2 shadow-xl ring-2 ring-primary-300/40">
				<iconify-icon icon="mdi:resize-bottom-right" width="16" class="text-white drop-shadow"></iconify-icon>
			</div>
		</div>
		<div
			class="absolute right-0 top-1/2 z-10 -translate-y-1/2 cursor-e-resize opacity-0 transition-all duration-200 hover:scale-125 hover:opacity-100"
			onpointerdown={(e) => handleResizePointerDown(e, 'e')}
			title="Drag to resize widget width"
			aria-label="Drag to resize widget width"
		>
			<div class="rounded-l-lg bg-primary-500/90 px-2 py-4 shadow-lg ring-2 ring-primary-300/40">
				<iconify-icon icon="mdi:drag-horizontal" width="12" class="text-white drop-shadow"></iconify-icon>
			</div>
		</div>
		<div
			class="absolute bottom-0 left-1/2 z-10 -translate-x-1/2 cursor-s-resize opacity-0 transition-all duration-200 hover:scale-125 hover:opacity-100"
			onpointerdown={(e) => handleResizePointerDown(e, 's')}
			title="Drag to resize widget height"
			aria-label="Drag to resize widget height"
		>
			<div class="rounded-t-lg bg-primary-500/90 px-4 py-1 shadow-lg ring-2 ring-primary-300/40">
				<iconify-icon icon="mdi:drag-vertical" width="12" class="text-white drop-shadow"></iconify-icon>
			</div>
		</div>
		{#if resizing}
			<div class="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-xl bg-primary-500/10 backdrop-blur-md">
				<div class="mb-3 rounded-lg border border-primary-400 bg-primary-500 px-6 py-4 text-base text-white shadow-2xl">
					<div class="flex items-center gap-4">
						<iconify-icon icon={getSizeIcon(previewSize)} width="24" class="text-white drop-shadow"></iconify-icon>
						<div class="flex flex-col">
							<span class="font-semibold">Snap to {getSizeLabel(previewSize)}</span>
							<span class="text-sm opacity-80">{getColumnSpan(previewSize)} of 4 columns</span>
							<span class="mt-1 text-xs">Row span: {widgetEl?.getAttribute('data-row-span-preview') || rowSpan}</span>
						</div>
					</div>
				</div>
				<div class="flex gap-2">
					{#each Array(4) as _, i}
						<div class="h-2 w-10 rounded bg-primary-400/80 {i < getColumnSpan(previewSize) ? '' : 'bg-surface-200/60 dark:bg-surface-700/60'}"></div>
					{/each}
				</div>
			</div>
		{/if}
	{/if}
</article>

<style lang="postcss">
	[class*='cursor-'] iconify-icon {
		transition: transform 0.12s cubic-bezier(0.4, 0, 0.2, 1);
	}
	[class*='cursor-']:hover iconify-icon {
		transform: scale(1.25);
	}
	[class*='cursor-']:active iconify-icon {
		transform: scale(1);
	}
</style>
