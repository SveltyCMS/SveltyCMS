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

		// New props for predefined sizing
		currentSize = '1/4' as '1/4' | '1/2' | '3/4' | 'full',
		availableSizes = ['1/4', '1/2', '3/4', 'full'] as ('1/4' | '1/2' | '3/4' | 'full')[],
		onSizeChange = (_newSize: '1/4' | '1/2' | '3/4' | 'full') => {},

		// New props for row spanning
		rowSpan = 1,
		onRowSpanChange = (_newRowSpan: number) => {},

		gridCellWidth = $bindable(0),
		ROW_HEIGHT = $bindable(0),
		GAP_SIZE = $bindable(0),
		resizable = true,
		onResizeCommitted = () => {},
		onCloseRequest = () => {},
		initialData: passedInitialData = undefined,
		onDataLoaded = (_fetchedData: any) => {}, // New prop: Callback for when data is loaded
		// Initialize `data` with $bindable() directly.
		// Its initial value will be set from passedInitialData in an effect.
		data = $bindable(undefined) // This is the bindable prop
	} = $props<{
		label: string;
		theme?: 'light' | 'dark';
		icon?: string;
		endpoint?: string;
		pollInterval?: number;
		widgetId?: string;
		children?: Snippet<ChildSnippetProps>;

		// New props for predefined sizing
		currentSize?: '1/4' | '1/2' | '3/4' | 'full';
		availableSizes?: ('1/4' | '1/2' | '3/4' | 'full')[];
		onSizeChange?: (newSize: '1/4' | '1/2' | '3/4' | 'full') => void;

		// New props for row spanning
		rowSpan?: number;
		onRowSpanChange?: (newRowSpan: number) => void;

		gridCellWidth: number;
		ROW_HEIGHT: number;
		GAP_SIZE: number;
		resizable?: boolean;
		onResizeCommitted?: (spans: { w: number; h: number }) => void;
		onCloseRequest?: () => void;
		initialData?: any;
		data?: any;
		onDataLoaded?: (fetchedData: any) => void;
	}>();

	// State management
	let initialDataSet = false;
	let widgetState = $state<Record<string, any>>({});
	let loading = $state(endpoint && !passedInitialData);
	let error = $state<string | null>(null);
	let internalData = $state(passedInitialData);

	// Data handling effect - properly handle initial data
	$effect(() => {
		if (passedInitialData !== undefined && !initialDataSet) {
			internalData = passedInitialData;
			initialDataSet = true;
		}
	});

	// Data fetching effect
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

		if (pollInterval > 0) {
			timerId = setInterval(fetchData, pollInterval);
		}

		return () => {
			isActive = false;
			clearInterval(timerId);
		};
	});

	// Resize handling
	let widgetEl: HTMLDivElement | undefined = $state();
	let resizing = $state(false);
	let resizeDir: string | null = $state(null);
	let startPointer = { x: 0, y: 0 };
	let startDimensions = { w: 0, h: 0 };
	let currentPixelDimensions = $state({ w: 0, h: 0 });
	let previewSize = $state<'1/4' | '1/2' | '3/4' | 'full'>('1/4'); // Preview of target size

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

		if (columnEquivalent < 1.3) {
			previewSize = '1/4';
		} else if (columnEquivalent < 2.3) {
			previewSize = '1/2';
		} else if (columnEquivalent < 3.3) {
			previewSize = '3/4';
		} else {
			previewSize = 'full';
		}

		// Apply temporary styles during resize
		widgetEl.style.width = `${currentPixelDimensions.w}px`;
		widgetEl.style.height = `${currentPixelDimensions.h}px`;
		widgetEl.style.opacity = '0.8';

		// Optionally: show a debug overlay for row span preview
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

		// Use the same improved logic as in handleResizePointerMove
		const gridContainer = widgetEl.parentElement?.parentElement; // widget-container -> grid
		const gridWidth = gridContainer?.offsetWidth || 1200;
		const gridGap = 16; // GAP_SIZE from dashboard
		const gridCols = 4; // GRID_COLS from dashboard

		// Calculate the actual width available for one column
		const totalGapWidth = gridGap * (gridCols - 1);
		const availableGridWidth = gridWidth - totalGapWidth;
		const singleColumnWidth = availableGridWidth / gridCols;

		const finalWidth = currentPixelDimensions.w;
		const finalHeight = currentPixelDimensions.h;
		const columnEquivalent = finalWidth / (singleColumnWidth + gridGap);
		const rowEquivalent = finalHeight / (ROW_HEIGHT + gridGap);

		let newSize: '1/4' | '1/2' | '3/4' | 'full';
		let newRowSpan = rowSpan;

		// Snap to nearest size based on column equivalents
		if (columnEquivalent < 1.3) {
			newSize = '1/4';
		} else if (columnEquivalent < 2.3) {
			newSize = '1/2';
		} else if (columnEquivalent < 3.3) {
			newSize = '3/4';
		} else {
			newSize = 'full';
		}

		// Snap to nearest row span (1-4)
		newRowSpan = Math.max(1, Math.min(4, Math.round(rowEquivalent)));

		console.log(
			`BaseWidget: Resize completed - width: ${finalWidth}px, height: ${finalHeight}px, column eq: ${columnEquivalent.toFixed(2)}, row eq: ${rowEquivalent.toFixed(2)}, snapped to: ${newSize}, rowSpan: ${newRowSpan}`
		);

		onSizeChange(newSize);
		onRowSpanChange(newRowSpan);

		widgetEl.style.width = '';
		widgetEl.style.height = '';
		widgetEl.style.opacity = '';
		resizing = false;
		resizeDir = null;
	}

	// Cleanup effect
	$effect(() => () => {
		window.removeEventListener('pointermove', handleResizePointerMove);
		window.removeEventListener('pointerup', handleResizePointerUp);
	});

	// Widget state management
	function updateWidgetState(key: string, value: any) {
		widgetState = { ...widgetState, [key]: value };
	}

	function getWidgetState(key: string) {
		return widgetState[key];
	}

	// Size management - Custom SVG icons for intuitive size representation
	function getSizeIconSvg(size: '1/4' | '1/2' | '3/4' | 'full'): string {
		const baseStyle = 'fill="currentColor" stroke="currentColor" stroke-width="0.5"';
		switch (size) {
			case '1/4':
				// Show 1 out of 4 segments filled with better spacing
				return `<svg viewBox="0 0 20 16" width="14" height="14">
					<rect x="1" y="6" width="4" height="4" ${baseStyle} opacity="1"/>
					<rect x="6" y="6" width="4" height="4" ${baseStyle} opacity="0.15"/>
					<rect x="11" y="6" width="4" height="4" ${baseStyle} opacity="0.15"/>
					<rect x="16" y="6" width="3" height="4" ${baseStyle} opacity="0.15"/>
				</svg>`;
			case '1/2':
				// Show 2 out of 4 segments filled with better spacing
				return `<svg viewBox="0 0 20 16" width="14" height="14">
					<rect x="1" y="6" width="4" height="4" ${baseStyle} opacity="1"/>
					<rect x="6" y="6" width="4" height="4" ${baseStyle} opacity="1"/>
					<rect x="11" y="6" width="4" height="4" ${baseStyle} opacity="0.15"/>
					<rect x="16" y="6" width="3" height="4" ${baseStyle} opacity="0.15"/>
				</svg>`;
			case '3/4':
				// Show 3 out of 4 segments filled with better spacing
				return `<svg viewBox="0 0 20 16" width="14" height="14">
					<rect x="1" y="6" width="4" height="4" ${baseStyle} opacity="1"/>
					<rect x="6" y="6" width="4" height="4" ${baseStyle} opacity="1"/>
					<rect x="11" y="6" width="4" height="4" ${baseStyle} opacity="1"/>
					<rect x="16" y="6" width="3" height="4" ${baseStyle} opacity="0.15"/>
				</svg>`;
			case 'full':
				// Show all 4 segments filled with better spacing
				return `<svg viewBox="0 0 20 16" width="14" height="14">
					<rect x="1" y="6" width="4" height="4" ${baseStyle} opacity="1"/>
					<rect x="6" y="6" width="4" height="4" ${baseStyle} opacity="1"/>
					<rect x="11" y="6" width="4" height="4" ${baseStyle} opacity="1"/>
					<rect x="16" y="6" width="3" height="4" ${baseStyle} opacity="1"/>
				</svg>`;
			default:
				return getSizeIconSvg('1/4');
		}
	}

	function getSizeIcon(size: '1/4' | '1/2' | '3/4' | 'full'): string {
		switch (size) {
			case '1/4':
				return 'mdi:table-column-width';
			case '1/2':
				return 'mdi:table-column-plus-after';
			case '3/4':
				return 'mdi:table-large';
			case 'full':
				return 'mdi:arrow-expand-horizontal';
			default:
				return 'mdi:table-column-width';
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

	function getColumnSpan(size: '1/4' | '1/2' | '3/4' | 'full'): number {
		switch (size) {
			case '1/4':
				return 1;
			case '1/2':
				return 2;
			case '3/4':
				return 3;
			case 'full':
				return 4;
			default:
				return 1;
		}
	}

	function handleSizeChange(newSize: '1/4' | '1/2' | '3/4' | 'full') {
		console.log(`BaseWidget: Changing size from ${currentSize} to ${newSize}`);
		// Always call onSizeChange, even if the size is the same
		// This ensures the parent component handles the change properly
		onSizeChange(newSize);
	}

	const handleOffset = '-translate-x-1/2 -translate-y-1/2';
</script>

<div
	bind:this={widgetEl}
	class="widget-container text-text-900 dark:text-text-100 group relative flex h-full flex-col rounded-lg border border-surface-200 bg-white shadow-sm transition-all duration-150 dark:border-surface-700 dark:bg-surface-800
        {resizing ? 'scale-[1.01] shadow-md ring-2 ring-primary-300/60' : 'hover:shadow-md'} focus-within:ring-2 focus-within:ring-primary-200"
	style="user-select: {resizing ? 'none' : 'auto'};"
	aria-labelledby="widget-title-{widgetId || label}"
>
	<!-- Header -->
	<div
		class="widget-header flex items-center justify-between border-b border-gray-100 bg-white py-2 pl-4 pr-2 dark:border-surface-700 dark:bg-surface-800"
	>
		<h3
			id="widget-title-{widgetId || label}"
			class="font-display text-text-900 dark:text-text-100 flex items-center gap-2 truncate text-base font-semibold tracking-tight"
		>
			{#if icon}
				<iconify-icon {icon} width="20" class={theme === 'light' ? 'text-tertiary-600' : 'text-primary-400'}></iconify-icon>
			{/if}
			<span class="truncate">{label}</span>
		</h3>

		<div class="flex items-center gap-2">
			<!-- Size option buttons -->
			<div class="flex items-center gap-1 rounded-lg bg-gray-50 p-1 dark:bg-surface-700/80">
				{#each availableSizes as size}
					{@const isActive = currentSize === size}
					{@const sizeIconSvg = getSizeIconSvg(size)}
					<button
						onclick={() => handleSizeChange(size)}
						class="btn-icon-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400 {isActive
							? 'bg-primary-500 text-white shadow-sm'
							: 'text-text-400 hover:text-primary-500 dark:hover:text-primary-400'}"
						title={getSizeLabel(size)}
						aria-label="Resize widget to {getSizeLabel(size)}"
						data-size={size}
						data-active={isActive}
					>
						{@html sizeIconSvg}
					</button>
				{/each}
			</div>

			<!-- Close button -->
			<button
				onclick={onCloseRequest}
				class="text-text-400 btn-icon hover:text-error-500 focus:outline-none focus:ring-2 focus:ring-error-400"
				aria-label="Remove {label} widget"
			>
				<iconify-icon icon="mdi:close" width="18"></iconify-icon>
			</button>
		</div>
	</div>

	<!-- Body -->
	<div
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
	</div>

	<!-- Resize handles -->
	{#if resizable}
		<!-- SE Resize Handle - Primary resize handle for width/height adjustment -->
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

		<!-- East-only handle for width-only resizing -->
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

		<!-- South-only handle for height-only resizing -->
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

		<!-- Resize preview overlay -->
		{#if resizing}
			<div class="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-xl bg-primary-500/10 backdrop-blur-md">
				<div class="mb-3 rounded-lg border border-primary-400 bg-primary-500 px-6 py-4 text-base text-white shadow-2xl">
					<div class="flex items-center gap-4">
						{@html getSizeIconSvg(previewSize)}
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
</div>

<style lang="postcss">
	.widget-container {
		transition:
			box-shadow 0.2s ease-in-out,
			border-color 0.2s ease-in-out,
			background 0.3s cubic-bezier(0.4, 0, 0.2, 1),
			transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.widget-header {
		transition:
			box-shadow 0.2s,
			background 0.3s;
		z-index: 2;
	}

	.widget-body {
		scrollbar-width: thin;
		scrollbar-color: theme('colors.slate.300') transparent;
		transition: background 0.3s;
	}

	.btn-icon-sm {
		@apply flex h-7 w-7 items-center justify-center rounded-lg;
		min-width: 1.75rem;
		min-height: 1.75rem;
	}

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
