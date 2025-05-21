<!--
@file src/routes/(app)/dashboard/BaseWidget.svelte
@component
**Base widget component providing common functionality for all dashboard widgets**

### Props
- `label`: The widget's display label
- `theme`: Current theme ('light' or 'dark')
- `endpoint`: API endpoint for data fetching
- `pollInterval`: Data refresh interval in milliseconds (default: 5000)
- `data`: Bindable data property for widget content
- `widgetId`: Unique identifier for widget state persistence
- `icon`: Optional icon for the widget
- `children`: Slot for widget-specific contenta

### Features:
- Common properties for all widgets
- State management using Svelte 5 runes
- Polling effect for real-time data updates
- Widget state persistence
- Error handling and logging
-->

<script lang="ts">
	// Common props for all widgets
	const {
		label,
		theme = 'light',
		endpoint,
		pollInterval = 5000,
		data: initialData = $bindable(),
		widgetId,
		icon = undefined,
		children,
		onResize = undefined // optional callback: (size: {w: number, h: number}) => void
	} = $props<{
		label: string;
		theme: 'light' | 'dark';
		endpoint: string;
		pollInterval: number;
		data?: any;
		widgetId?: string;
		icon?: string;
		children?: () => any;
		onResize?: (size: { w: number; h: number }) => void;
	}>();

	let data = $state(initialData);
	let widgetState = $state<Record<string, any>>({});

	// Reactive state using Svelte 5 runes
	let loading = $state(true);
	let error = $state<string | null>(null);

	// Load widget state on mount if widgetId is provided
	$effect(() => {
		if (!widgetId) return;

		const loadState = async () => {
			try {
				const res = await fetch(`/api/systemPreferences?widgetId=${widgetId}`);
				if (!res.ok) throw new Error(`HTTP ${res.status}`);

				const { state } = await res.json();
				if (state) widgetState = state;
			} catch (err) {
				console.error('Error loading widget state:', err);
			}
		};

		loadState();
	});

	// Save widget state when it changes
	$effect(() => {
		if (!widgetId || Object.keys(widgetState).length === 0) return;

		const saveState = async () => {
			try {
				await fetch('/api/systemPreferences', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ widgetId, state: widgetState })
				});
			} catch (err) {
				console.error('Error saving widget state:', err);
			}
		};

		saveState();
	});

	// Function to create a polling effect
	function createPollingEffect(options: { interval: number; callback: () => Promise<void>; immediate: boolean }) {
		let intervalId: NodeJS.Timeout;

		const startPolling = () => {
			intervalId = setInterval(options.callback, options.interval);
		};

		const stopPolling = () => {
			clearInterval(intervalId);
		};

		if (options.immediate) {
			options.callback().then(() => startPolling());
		} else {
			startPolling();
		}

		return {
			cleanup: stopPolling
		};
	}

	// Create polling effect using the custom function
	$effect(() => {
		const { cleanup } = createPollingEffect({
			interval: pollInterval,
			callback: async () => {
				try {
					loading = true;
					error = null;

					const timestamp = new Date().getTime();
					const res = await fetch(`${endpoint}?_=${timestamp}`);

					if (!res.ok) throw new Error(`HTTP ${res.status}`);

					const newData = await res.json();
					data = newData;
				} catch (err) {
					error = err instanceof Error ? err.message : 'Failed to fetch data';
					console.error('Error fetching data:', error);
				} finally {
					loading = false;
				}
			},
			immediate: true
		});

		return cleanup;
	});

	// Expose state management functions to child widgets
	function updateWidgetState(key: string, value: any) {
		widgetState = { ...widgetState, [key]: value };
	}

	function getWidgetState(key: string) {
		return widgetState[key];
	}

	import { createEventDispatcher } from 'svelte';
	const dispatch = createEventDispatcher();

	let widgetEl: HTMLDivElement | null = null;
	let resizing = $state(false);
	let resizeDir: string | null = null;
	let startX = 0;
	let startY = 0;
	let startWidth = 0;
	let startHeight = 0;
	let overResizeHandle = $state(false);

	function handleResizeMouseDown(e: MouseEvent, dir: string) {
		e.preventDefault();
		e.stopPropagation();
		resizing = true;
		resizeDir = dir;
		startX = e.clientX;
		startY = e.clientY;
		if (widgetEl) {
			startWidth = widgetEl.offsetWidth;
			startHeight = widgetEl.offsetHeight;
		}
		window.addEventListener('mousemove', handleResizeMouseMove);
		window.addEventListener('mouseup', handleResizeMouseUp);
	}

	function handleResizeMouseMove(e: MouseEvent) {
		if (!resizing || !widgetEl) return;
		let newWidth = startWidth;
		let newHeight = startHeight;
		const minSize = 100; // px

		if (resizeDir === 'se') {
			newWidth = Math.max(minSize, startWidth + (e.clientX - startX));
			newHeight = Math.max(minSize, startHeight + (e.clientY - startY));
		} else if (resizeDir === 'ne') {
			newWidth = Math.max(minSize, startWidth + (e.clientX - startX));
			newHeight = Math.max(minSize, startHeight - (e.clientY - startY));
		} else if (resizeDir === 'sw') {
			newWidth = Math.max(minSize, startWidth - (e.clientX - startX));
			newHeight = Math.max(minSize, startHeight + (e.clientY - startY));
		} else if (resizeDir === 'nw') {
			newWidth = Math.max(minSize, startWidth - (e.clientX - startX));
			newHeight = Math.max(minSize, startHeight - (e.clientY - startY));
		}

		widgetEl.style.width = newWidth + 'px';
		widgetEl.style.height = newHeight + 'px';

		if (onResize) {
			onResize({ w: newWidth, h: newHeight });
		}
	}

	function handleResizeMouseUp() {
		resizing = false;
		resizeDir = null;
		window.removeEventListener('mousemove', handleResizeMouseMove);
		window.removeEventListener('mouseup', handleResizeMouseUp);
	}

	function handleResizeEnter() {
		overResizeHandle = true;
	}
	function handleResizeLeave() {
		overResizeHandle = false;
	}

	function handleClose() {
		dispatch('close');
	}
</script>

<!-- Common widget structure -->
<div
	class="widget-container flex h-full flex-col rounded-md p-4"
	class:bg-surface-100={theme === 'light'}
	class:text-text-900={theme === 'light'}
	class:bg-surface-700={theme === 'dark'}
	class:text-text-100={theme === 'dark'}
	aria-label={`${label} widget`}
	style="user-select: {resizing ? 'none' : 'auto'};"
	draggable={!overResizeHandle && !resizing}
>
	<!-- Title -->
	<h2 class="mb-4 flex items-center gap-2 text-xl font-bold">
		{#if icon}
			<iconify-icon {icon} width="30" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
		{/if}
		{label}
	</h2>

	<!-- Close button triggers Svelte event -->
	<button onclick={handleClose} class="btn-icon absolute right-1 top-1 z-10 flex gap-1 text-error-50" aria-label="Remove Widget">
		<iconify-icon icon="mdi:close" width="20"></iconify-icon>
	</button>

	{#if loading && !data}
		<div class="loading-state flex flex-1 items-center justify-center text-center">Loading...</div>
	{:else if error && !data}
		<div class="error-state flex flex-1 items-center justify-center text-center text-error-500">
			Error: {error}
		</div>
	{:else}
		<!-- Widget-specific content goes here -->
		{@render children?.({ data, updateWidgetState, getWidgetState })}
	{/if}

	<!-- Resizable corners (functional, disables drag when hovered/active) -->
	<div class="pointer-events-none absolute inset-0 select-none">
		<!-- NW -->
		<div
			class="pointer-events-auto absolute left-0 top-0 z-20 h-3 w-3 cursor-nwse-resize"
			aria-label="Resize widget from top left corner"
			role="button"
			tabindex="0"
			onmousedown={(e) => handleResizeMouseDown(e, 'nw')}
			onmouseenter={handleResizeEnter}
			onmouseleave={handleResizeLeave}
		></div>
		<!-- NE -->
		<div
			class="pointer-events-auto absolute right-0 top-0 z-20 h-3 w-3 cursor-nesw-resize"
			aria-label="Resize widget from top right corner"
			role="button"
			tabindex="0"
			onmousedown={(e) => handleResizeMouseDown(e, 'ne')}
			onmouseenter={handleResizeEnter}
			onmouseleave={handleResizeLeave}
		></div>
		<!-- SW -->
		<div
			class="pointer-events-auto absolute bottom-0 left-0 z-20 h-3 w-3 cursor-nesw-resize"
			aria-label="Resize widget from bottom left corner"
			role="button"
			tabindex="0"
			onmousedown={(e) => handleResizeMouseDown(e, 'sw')}
			onmouseenter={handleResizeEnter}
			onmouseleave={handleResizeLeave}
		></div>
		<!-- SE -->
		<div
			class="pointer-events-auto absolute bottom-0 right-0 z-20 h-3 w-3 cursor-nwse-resize"
			aria-label="Resize widget from bottom right corner"
			role="button"
			tabindex="0"
			onmousedown={(e) => handleResizeMouseDown(e, 'se')}
			onmouseenter={handleResizeEnter}
			onmouseleave={handleResizeLeave}
		></div>
	</div>
</div>
