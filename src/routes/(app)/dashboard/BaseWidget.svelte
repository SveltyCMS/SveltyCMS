<!--
@file src/routes/(app)/dashboard/BaseWidget.svelte
@component
**Base widget component providing common functionality for all dashboard widgets**
-->
<script lang="ts">
	// Define Snippet type locally to avoid import issues
	type Snippet<T = any> = (args: T) => any;

	type WidgetSize = { w: number; h: number };

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
		size = { w: 1, h: 1 } as WidgetSize,
		onSizeChange = (_newSize: WidgetSize) => {},
		resizable = true,
		onCloseRequest = () => {},
		initialData: passedInitialData = undefined,
		onDataLoaded = (_fetchedData: any) => {},
		...rest
	} = $props<{
		label: string;
		theme?: 'light' | 'dark';
		icon?: string;
		endpoint?: string;
		pollInterval?: number;
		widgetId?: string;
		children?: Snippet<ChildSnippetProps>;
		size?: WidgetSize;
		onSizeChange?: (newSize: WidgetSize) => void;
		resizable?: boolean;
		onCloseRequest?: () => void;
		initialData?: any;
		onDataLoaded?: (fetchedData: any) => void;
		[key: string]: any;
	}>();

	let widgetState = $state<Record<string, any>>({});
	let loading = $state(endpoint && !passedInitialData);
	let error = $state<string | null>(null);
	let internalData = $state(passedInitialData);

	// Debug effect to check size prop
	$effect(() => {
		console.log(`Widget "${label}" current size:`, size);
	});

	// Effect for fetching data from an endpoint
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
	let showSizeMenu = $state(false);
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

	// --- Resizing Logic ---
	let isResizing = $state(false);
	let previewSize = $state<WidgetSize | null>(null);

	function handleResizePointerDown(e: PointerEvent) {
		if (!resizable || !widgetEl) return;
		e.preventDefault();
		e.stopPropagation();

		// Get direction from the clicked element or its parent
		const target = e.target as HTMLElement;
		const direction = target.dataset.direction || target.closest('[data-direction]')?.getAttribute('data-direction');
		console.log('Resize handle clicked:', direction);

		isResizing = true;
		const startX = e.clientX;
		const startY = e.clientY;
		const gridContainer = widgetEl.closest('.responsive-dashboard-grid') as HTMLElement;

		if (!gridContainer) {
			isResizing = false;
			return;
		}

		const gridGap = parseFloat(getComputedStyle(gridContainer).gap) || 16;
		const gridCols = 4;
		const totalGapWidth = gridGap * (gridCols - 1);
		const singleColumnWidth = (gridContainer.offsetWidth - totalGapWidth) / gridCols;
		const singleRowHeight = 180; // Updated to match the CSS grid-auto-rows value

		const currentColumns = size.w;
		const currentRows = size.h;

		const handlePointerMove = (moveEvent: PointerEvent) => {
			const deltaX = moveEvent.clientX - startX;
			const deltaY = moveEvent.clientY - startY;

			let columnChange = 0;
			if (direction?.includes('e')) columnChange = deltaX / (singleColumnWidth + gridGap);
			else if (direction?.includes('w')) columnChange = -deltaX / (singleColumnWidth + gridGap);

			let rowChange = 0;
			if (direction?.includes('s')) rowChange = deltaY / (singleRowHeight + gridGap);
			else if (direction?.includes('n')) rowChange = -deltaY / (singleRowHeight + gridGap);

			const targetColumns = Math.round(currentColumns + columnChange);
			const targetRows = Math.round(currentRows + rowChange);

			const newColumns = Math.max(1, Math.min(4, targetColumns));
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

	// Click outside to close menu
	function handleClickOutside(event: MouseEvent) {
		if (showSizeMenu && widgetEl && !widgetEl.contains(event.target as Node)) {
			showSizeMenu = false;
		}
	}

	// Effect to add/remove click outside listener
	$effect(() => {
		if (showSizeMenu) {
			document.addEventListener('click', handleClickOutside);
		} else {
			document.removeEventListener('click', handleClickOutside);
		}

		return () => {
			document.removeEventListener('click', handleClickOutside);
		};
	});

	function updateWidgetState(key: string, value: any) {
		widgetState = { ...widgetState, [key]: value };
	}

	function getWidgetState(key: string) {
		return widgetState[key];
	}

	function getSizeLabel(s: WidgetSize): string {
		return `${s.w}x${s.h}`;
	}
</script>

<article
	bind:this={widgetEl}
	class="widget-base-container text-text-900 dark:text-text-100 group relative flex h-full flex-col rounded-lg border border-surface-200 bg-white shadow-sm transition-all duration-150 focus-within:ring-2 focus-within:ring-primary-200 dark:border-surface-700 dark:bg-surface-800"
	aria-labelledby="widget-title-{widgetId || label}"
	style="overflow: visible;"
>
	<header
		class="widget-header flex cursor-grab items-center justify-between border-b border-gray-100 bg-white py-2 pl-4 pr-2 dark:border-surface-700 dark:bg-surface-800"
		style="touch-action: none; overflow: visible; position: relative; z-index: 10;"
	>
		<h2
			id="widget-title-{widgetId || label}"
			class="text-text-900 dark:text-text-100 font-display flex items-center gap-2 truncate text-base font-semibold tracking-tight"
		>
			{#if icon}
				<iconify-icon {icon} width="24" class={theme === 'light' ? 'text-tertiary-600' : 'text-primary-400'}></iconify-icon>
			{/if}
			<span class="truncate">{label}</span>
		</h2>

		<div class="flex items-center gap-1">
			<div class="relative" style="overflow: visible;">
				<button onclick={() => (showSizeMenu = !showSizeMenu)} class="variant-outline-surface btn-icon" aria-label="Change widget size">
					<iconify-icon icon="mdi:dots-vertical" width="18"></iconify-icon>
				</button>
				{#if showSizeMenu}
					<div
						class="absolute right-0 top-full z-50 mt-2 w-48 rounded-md border border-surface-200 bg-white py-1 shadow-xl dark:border-surface-700 dark:bg-surface-800"
						style="z-index: 9999; position: absolute;"
					>
						{#each availableSizes as s (s)}
							<button
								class="flex w-full items-center justify-between px-4 py-2 text-sm transition-colors hover:bg-surface-100 dark:hover:bg-surface-700 {size.w ===
									s.w && size.h === s.h
									? 'font-bold text-primary-500'
									: ''}"
								onclick={() => handleMenuSizeChange(s)}
							>
								<span>{getSizeLabel(s)}</span>
								{#if size.w === s.w && size.h === s.h}
									<iconify-icon icon="mdi:check" class="text-primary-500"></iconify-icon>
								{/if}
							</button>
						{/each}
					</div>
				{/if}
			</div>
			<button onclick={onCloseRequest} class="variant-outline-surface btn-icon" aria-label="Remove {label} widget">
				<iconify-icon icon="mdi:close" width="18"></iconify-icon>
			</button>
		</div>
	</header>
	<section
		class="widget-body relative min-h-[50px] flex-1 bg-white px-3 pb-2 dark:bg-surface-800"
		style="width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: stretch; align-items: stretch;"
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
		<!-- Resize handles with proper corner icons and subtle colors -->
		<div class="resize-handles pointer-events-none absolute inset-0">
			{#each [{ dir: 'nw', classes: 'top-0 left-0 cursor-nw-resize', icon: 'clarity:drag-handle-corner-line', size: '12px', rotation: 'rotate-180' }, { dir: 'n', classes: 'top-0 left-1/2 cursor-n-resize', icon: 'mdi:drag-vertical', size: '12px', style: 'transform: translateX(-50%) rotate(90deg);', rotation: '' }, { dir: 'ne', classes: 'top-0 right-0 cursor-ne-resize', icon: 'clarity:drag-handle-corner-line', size: '12px', rotation: '-rotate-90' }, { dir: 'e', classes: 'top-1/2 right-0 cursor-e-resize', icon: 'mdi:drag-vertical', size: '12px', style: 'transform: translateY(-50%) rotate(180deg);', rotation: '' }, { dir: 'se', classes: 'bottom-0 right-0 cursor-se-resize', icon: 'clarity:drag-handle-corner-line', size: '12px', rotation: '' }, { dir: 's', classes: 'bottom-0 left-1/2 cursor-s-resize', icon: 'mdi:drag-vertical', size: '12px', style: 'transform: translateX(-50%) rotate(90deg);', rotation: '' }, { dir: 'sw', classes: 'bottom-0 left-0 cursor-sw-resize', icon: 'clarity:drag-handle-corner-line', size: '12px', rotation: 'rotate-90' }, { dir: 'w', classes: 'top-1/2 left-0 cursor-w-resize', icon: 'mdi:drag-vertical', size: '12px', style: 'transform: translateY(-50%) rotate(180deg);', rotation: '' }] as handle}
				<div
					class="pointer-events-auto absolute z-20 flex items-center justify-center opacity-0 transition-all duration-200 hover:scale-125 hover:opacity-100 group-hover:opacity-60 {handle.classes} {handle.rotation}"
					style="width: 16px; height: 16px; {handle.style || ''}"
					data-direction={handle.dir}
					title="Resize widget by dragging {handle.dir}"
					aria-label="Resize widget {handle.dir}"
					onpointerdown={handleResizePointerDown}
					role="button"
					tabindex="0"
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							// Could implement keyboard resizing here
						}
					}}
				>
					<iconify-icon icon={handle.icon} width={handle.size} class="text-gray-900 drop-shadow-sm dark:text-surface-300"></iconify-icon>
				</div>
			{/each}
		</div>
	{/if}

	{#if isResizing && previewSize}
		<div class="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-lg bg-primary-500/10 backdrop-blur-sm">
			<div class="rounded-lg bg-primary-500 px-4 py-2 text-white shadow-lg">
				Snap to: {getSizeLabel(previewSize)}
			</div>
		</div>
	{/if}
</article>
