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
		children = undefined as Snippet<[ChildSnippetProps]> | undefined,

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
		children?: Snippet<[ChildSnippetProps]>;

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

	// Data handling effect
	$effect(() => {
		if (data !== undefined) {
			// If data prop is provided (bindable), use it
			internalData = data;
		} else if (passedInitialData !== undefined) {
			// Fallback to internal data if no bindable prop provided
			internalData = passedInitialData;
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
					if (data !== undefined) {
						data.set(newData); // Only call set if data is bindable
					} else {
						internalData = newData; // Fallback to internal state
					}
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

		const minVisualPx = 50;
		currentPixelDimensions = {
			w: Math.max(minVisualPx, newW),
			h: Math.max(minVisualPx, newH)
		};
		widgetEl.style.width = `${currentPixelDimensions.w}px`;
		widgetEl.style.height = `${currentPixelDimensions.h}px`;
	}

	function handleResizePointerUp(e: PointerEvent) {
		if (!resizing || !widgetEl) {
			resizing = false;
			return;
		}

		(e.target as HTMLElement).releasePointerCapture(e.pointerId);
		window.removeEventListener('pointermove', handleResizePointerMove);
		window.removeEventListener('pointerup', handleResizePointerUp);

		if (onResizeCommitted && gridCellWidth > 0 && ROW_HEIGHT > 0) {
			const finalWidth = currentPixelDimensions.w;
			const finalHeight = currentPixelDimensions.h;
			const newSpanW = Math.max(1, Math.round((finalWidth + GAP_SIZE) / (gridCellWidth + GAP_SIZE)));
			const newSpanH = Math.max(1, Math.round((finalHeight + GAP_SIZE) / (ROW_HEIGHT + GAP_SIZE)));
			onResizeCommitted({ w: newSpanW, h: newSpanH });
		}

		widgetEl.style.width = '';
		widgetEl.style.height = '';
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

	const handleOffset = '-translate-x-1/2 -translate-y-1/2';
</script>

<div
	bind:this={widgetEl}
	class="widget-container group flex h-full flex-col overflow-hidden rounded-lg border shadow-md
        {theme === 'light' ? 'border-gray-200 bg-white text-gray-800' : 'border-gray-700 bg-gray-800 text-gray-100'}"
	style:user-select={resizing ? 'none' : 'auto'}
	aria-labelledby="widget-title-{widgetId || label}"
>
	<div
		class="widget-header flex items-center justify-between border-b p-2.5
            {theme === 'light' ? 'border-gray-200 bg-gray-50' : 'bg-gray-750 border-gray-700'}"
	>
		<h3 id="widget-title-{widgetId || label}" class="flex items-center gap-1.5 truncate text-sm font-medium">
			{#if icon}
				<iconify-icon {icon} width="16" class={theme === 'light' ? 'text-tertiary-600' : 'text-primary-400'}></iconify-icon>
			{/if}
			<span class="truncate">{label}</span>
		</h3>
		<button
			onclick={onCloseRequest}
			class="btn-icon rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-600 dark:hover:text-gray-300"
			aria-label="Remove {label} widget"
		>
			<iconify-icon icon="mdi:close" width="16"></iconify-icon>
		</button>
	</div>

	<div class="widget-body relative min-h-[50px] flex-1 overflow-auto p-3">
		{#if endpoint && loading && !data}
			<div class="loading-state absolute inset-0 flex items-center justify-center text-xs text-gray-500">Loading...</div>
		{:else if endpoint && error && !data}
			<div class="error-state absolute inset-0 flex flex-col items-center justify-center p-2 text-center text-xs text-error-500">
				<iconify-icon icon="mdi:alert-circle-outline" width="20" class="mb-1"></iconify-icon>
				<span>{error}</span>
			</div>
		{:else if children}
			{@render children([{ data: data, updateWidgetState, getWidgetState }])}
		{:else if data}
			<pre class="whitespace-pre-wrap break-all text-xs">{JSON.stringify(data, null, 2)}</pre>
		{:else}
			<div class="absolute inset-0 flex items-center justify-center text-xs text-gray-400">No content.</div>
		{/if}
	</div>

	{#if resizable}
		<!-- SE Resize Handle -->
		<div
			class="absolute bottom-0 right-0 z-10 cursor-se-resize {handleOffset} translate-x-px translate-y-px"
			onpointerdown={(e) => handleResizePointerDown(e, 'se')}
		>
			<iconify-icon
				icon="mdi:chevron-double-down-right"
				width="16"
				class="text-primary-500/60 hover:text-primary-600 active:text-primary-700"
				flip={theme === 'dark' ? 'vertical' : ''}
			></iconify-icon>
		</div>

		<!-- SW Resize Handle -->
		<div
			class="absolute bottom-0 left-0 z-10 cursor-sw-resize {handleOffset} -translate-x-px translate-y-px"
			onpointerdown={(e) => handleResizePointerDown(e, 'sw')}
		>
			<iconify-icon
				icon="mdi:chevron-double-down-left"
				width="16"
				class="text-primary-500/60 hover:text-primary-600 active:text-primary-700"
				flip={theme === 'dark' ? 'vertical' : ''}
			></iconify-icon>
		</div>

		<!-- NE Resize Handle -->
		<div
			class="absolute right-0 top-0 z-10 cursor-ne-resize {handleOffset} -translate-y-px translate-x-px"
			onpointerdown={(e) => handleResizePointerDown(e, 'ne')}
		>
			<iconify-icon
				icon="mdi:chevron-double-up-right"
				width="16"
				class="text-primary-500/60 hover:text-primary-600 active:text-primary-700"
				flip={theme === 'dark' ? 'vertical' : ''}
			></iconify-icon>
		</div>

		<!-- NW Resize Handle -->
		<div
			class="absolute left-0 top-0 z-10 cursor-nw-resize {handleOffset} -translate-x-px -translate-y-px"
			onpointerdown={(e) => handleResizePointerDown(e, 'nw')}
		>
			<iconify-icon
				icon="mdi:chevron-double-up-left"
				width="16"
				class="text-primary-500/60 hover:text-primary-600 active:text-primary-700"
				flip={theme === 'dark' ? 'vertical' : ''}
			></iconify-icon>
		</div>
	{/if}
</div>

<style lang="postcss">
	.widget-container {
		transition:
			box-shadow 0.2s ease-in-out,
			border-color 0.2s ease-in-out;
	}

	.widget-body {
		scrollbar-width: thin;
		scrollbar-color: theme('colors.gray.300') transparent;
	}

	[class*='cursor-'] iconify-icon {
		transition: transform 0.1s ease;
	}

	[class*='cursor-']:hover iconify-icon {
		transform: scale(1.2);
	}

	[class*='cursor-']:active iconify-icon {
		transform: scale(1);
	}
</style>
