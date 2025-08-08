<!--
@file src/routes/(app)/dashboard/+page.svelte
@component
**Dashboard page providing a user-friendly interface for managing system resources and system messages**

@example
<Dashboard />

### Props
- `data` {object} - Object containing user data

### Features
- Displays widgets for CPU usage, disk usage, memory usage, performance, user activity, and system messages
- Fully responsive grid with dynamic width and height resizing
- Drag-and-drop widget reordering
- Persistent widget configurations via systemPreferences with multiple layouts
- Layout switching (e.g., default, compact)
- Accessible widget addition, removal, and layout switching
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { flip } from 'svelte/animate';
	import { modeCurrent } from '@skeletonlabs/skeleton';
	import { systemPreferences } from '@stores/systemPreferences.svelte';
	import PageTitle from '@components/PageTitle.svelte';
	import type { DashboardWidgetConfig, DropIndicator, WidgetSize, WidgetComponent, WidgetMeta } from '@config/types';

	const { data }: { data: PageData } = $props();

	const MAX_COLUMNS = 4;
	const MAX_ROWS = 4;
	const HEADER_HEIGHT = 48; // Approx height of widget header

	let mainContainerEl: HTMLElement | null = $state(null);
	let searchInput: HTMLInputElement | null = $state(null);
	let dropdownOpen = $state(false);
	let searchQuery = $state('');
	let loadError = $state<string | null>(null);
	let registryLoaded = $state(false);
	let widgetRegistry = $state<Record<string, { component: any; name: string; description: string; icon: string; widgetMeta?: WidgetMeta }>>({});

	let dragState: {
		item: DashboardWidgetConfig | null;
		element: HTMLElement | null;
		offset: { x: number; y: number };
		isActive: boolean;
		gridPosition?: { row: number; col: number };
	} = $state({ item: null, element: null, offset: { x: 0, y: 0 }, isActive: false });
	let dropIndicator: DropIndicator | null = $state(null);
	let gridDropIndicator: { row: number; col: number; width: number; height: number } | null = $state(null);

	async function loadWidgetRegistry() {
		const modules = import.meta.glob('./widgets/*.svelte');
		const registry: typeof widgetRegistry = {};
		for (const path in modules) {
			const name = path.split('/').pop()?.replace('.svelte', '');
			if (name) {
				const module = (await modules[path]()) as { default: WidgetComponent; widgetMeta: WidgetMeta };
				registry[name] = {
					component: module.default,
					name: module.widgetMeta?.name || name,
					description: module.widgetMeta?.description || '',
					icon: module.widgetMeta?.icon || 'mdi:widgets',
					widgetMeta: module.widgetMeta
				};
			}
		}
		widgetRegistry = registry;
		registryLoaded = true;
	}

	const widgetComponentRegistry = $derived(widgetRegistry);
	const currentPreferences = $derived($systemPreferences?.preferences || []);
	const availableWidgets = $derived(
		registryLoaded && currentPreferences
			? Object.keys(widgetComponentRegistry).filter((name) => !currentPreferences.some((item) => item.component === name))
			: []
	);
	const filteredWidgets = $derived(availableWidgets.filter((name) => name.toLowerCase().includes(searchQuery.toLowerCase())));
	const currentTheme: 'dark' | 'light' = $derived($modeCurrent ? 'dark' : 'light');

	// Helper function to calculate grid position from mouse coordinates
	function getGridPositionFromCoords(x: number, y: number, gridContainer: HTMLElement) {
		const rect = gridContainer.getBoundingClientRect();
		const relativeX = x - rect.left;
		const relativeY = y - rect.top;

		const gap = 16; // 1rem gap
		const cellWidth = (rect.width - gap * (MAX_COLUMNS - 1)) / MAX_COLUMNS;
		const cellHeight = 180 + gap; // grid-auto-rows: 180px + gap

		const col = Math.floor(relativeX / (cellWidth + gap));
		const row = Math.floor(relativeY / cellHeight);

		return {
			col: Math.max(0, Math.min(MAX_COLUMNS - 1, col)),
			row: Math.max(0, row)
		};
	}

	// Helper function to find insertion position based on coordinates
	function findInsertionPosition(x: number, y: number): number {
		const gridContainer = mainContainerEl?.querySelector('.responsive-dashboard-grid') as HTMLElement;
		if (!gridContainer) return currentPreferences.length;

		// Get all widget elements and their positions
		const widgets = Array.from(gridContainer.querySelectorAll('.widget-container')) as HTMLElement[];
		const widgetPositions = widgets.map((el) => {
			const rect = el.getBoundingClientRect();
			const gridRect = gridContainer.getBoundingClientRect();
			return {
				id: el.dataset.widgetId,
				centerX: rect.left + rect.width / 2 - gridRect.left,
				centerY: rect.top + rect.height / 2 - gridRect.top,
				rect
			};
		});

		const relativeX = x - gridContainer.getBoundingClientRect().left;
		const relativeY = y - gridContainer.getBoundingClientRect().top;

		// Find the closest widget or insertion point
		let insertIndex = 0;
		let minDistance = Infinity;

		for (let i = 0; i <= widgetPositions.length; i++) {
			let targetY, targetX;

			if (i === 0) {
				// Before first widget
				targetY = widgetPositions[0]?.centerY || 0;
				targetX = widgetPositions[0]?.centerX || 0;
			} else if (i === widgetPositions.length) {
				// After last widget
				const lastWidget = widgetPositions[widgetPositions.length - 1];
				targetY = lastWidget?.centerY || relativeY;
				targetX = lastWidget?.centerX || relativeX;
			} else {
				// Between widgets
				const prevWidget = widgetPositions[i - 1];
				const nextWidget = widgetPositions[i];
				targetY = (prevWidget.centerY + nextWidget.centerY) / 2;
				targetX = (prevWidget.centerX + nextWidget.centerX) / 2;
			}

			const distance = Math.sqrt(Math.pow(relativeX - targetX, 2) + Math.pow(relativeY - targetY, 2));

			if (distance < minDistance) {
				minDistance = distance;
				insertIndex = i;
			}
		}

		return insertIndex;
	}

	async function saveLayout() {
		try {
			if (!data.pageData?.user) return;
			await systemPreferences.setPreference(data.pageData.user.id, currentPreferences);
		} catch (err) {
			console.error('Failed to save layout:', err);
			loadError = 'Failed to save layout.';
		}
	}

	// Ensure all widgets have proper order values
	function ensureWidgetOrder() {
		if (!data.pageData?.user) return;

		const widgets = [...currentPreferences];
		let needsUpdate = false;

		// Check if any widgets are missing order property
		widgets.forEach((widget, index) => {
			if (typeof widget.order !== 'number') {
				widget.order = index;
				needsUpdate = true;
			}
		});

		// Sort by existing order and reassign sequential order values
		widgets.sort((a, b) => (a.order || 0) - (b.order || 0));
		widgets.forEach((widget, index) => {
			if (widget.order !== index) {
				widget.order = index;
				needsUpdate = true;
			}
		});

		// Update widgets if needed using batch update
		if (needsUpdate) {
			systemPreferences.updateWidgets(data.pageData.user.id, widgets);
		}
	}

	function addNewWidget(componentName: string) {
		if (!data.pageData?.user) {
			console.error('SveltyCMS: Cannot add widget, user data is not available.');
			loadError = 'Cannot add widget: User data is not available. Please try refreshing the page.';
			return;
		}
		const componentInfo = widgetComponentRegistry[componentName];
		if (!componentInfo) {
			console.error(`SveltyCMS: Widget component info for "${componentName}" not found in registry.`);
			loadError = `Cannot add widget: Component "${componentName}" not found.`;
			return;
		}

		const defaultSize = componentInfo.widgetMeta?.defaultSize || { w: 1, h: 1 };

		const newItem: DashboardWidgetConfig = {
			id: `widget-${Math.random().toString(36).substring(2, 15)}-${Date.now().toString(36)}`,
			component: componentName,
			label: componentInfo.name,
			icon: componentInfo.icon,
			size: defaultSize,
			settings: componentInfo.widgetMeta?.settings || {},
			order: currentPreferences.length // Use order instead of gridPosition
		};
		systemPreferences.updateWidget(data.pageData.user.id, newItem);
		dropdownOpen = false;
		searchQuery = '';
	}

	function removeWidget(id: string) {
		if (!data.pageData?.user) return;
		systemPreferences.removeWidget(data.pageData.user.id, id);
	}

	function resetAllWidgets() {
		if (!data.pageData?.user) return;
		systemPreferences.setPreference(data.pageData.user.id, []);
	}

	function resizeWidget(widgetId: string, newSize: WidgetSize) {
		if (!data.pageData?.user) return;
		const item = currentPreferences.find((i) => i.id === widgetId);
		if (item) {
			const updatedSize = {
				w: Math.max(1, Math.min(MAX_COLUMNS, newSize.w)),
				h: Math.max(1, Math.min(MAX_ROWS, newSize.h))
			};
			systemPreferences.updateWidget(data.pageData.user.id, { ...item, size: updatedSize });
		}
	}

	function performDrop(widget: DashboardWidgetConfig, indicator: { targetIndex: number }) {
		if (!data.pageData?.user) return;

		const currentWidgets = [...currentPreferences];
		const currentIndex = currentWidgets.findIndex((w) => w.id === widget.id);

		if (currentIndex === -1) return;

		// Remove from current position
		const [movedWidget] = currentWidgets.splice(currentIndex, 1);

		// Insert at new position
		currentWidgets.splice(indicator.targetIndex, 0, movedWidget);

		// Update order property for all widgets and save them as a batch
		const updatedWidgets = currentWidgets.map((w, index) => ({
			...w,
			order: index
		}));

		systemPreferences.updateWidgets(data.pageData.user.id, updatedWidgets);
	}
	function handleDragStart(event: MouseEvent | TouchEvent | PointerEvent, item: DashboardWidgetConfig, element: HTMLElement) {
		// Ignore clicks on interactive elements and resize handles
		if (!!(event.target as HTMLElement).closest('button, a, input, select, [role=button], .resize-handles, [data-direction]')) return;

		const coords = 'touches' in event ? event.touches[0] : event;
		const rect = element.getBoundingClientRect();

		if (coords.clientY - rect.top > HEADER_HEIGHT) return;

		event.preventDefault();
		dragState = {
			item,
			element,
			offset: { x: coords.clientX - rect.left, y: coords.clientY - rect.top },
			isActive: true
		};

		element.style.opacity = '0.5';
		element.style.zIndex = '1000';
		const clone = element.cloneNode(true) as HTMLElement;
		clone.style.cssText = `position: fixed; left: ${rect.left}px; top: ${rect.top}px; width: ${rect.width}px; height: ${rect.height}px; pointer-events: none; transform: scale(1.02); box-shadow: 0 20px 40px rgba(0,0,0,0.15); margin: 0;`;
		document.body.appendChild(clone);
		dragState.element = clone;

		// Use pointer events to cover mouse, touch, and pen with a passive move listener
		document.addEventListener('pointermove', handleDragMove as EventListener, { passive: true });
		document.addEventListener('pointerup', handleDragEnd as EventListener, { once: true });
	}

	function handleDragMove(event: MouseEvent | TouchEvent | PointerEvent) {
		if (!dragState.isActive || !dragState.element) return;

		const coords = 'touches' in event ? event.touches[0] : event;
		dragState.element.style.left = `${coords.clientX - dragState.offset.x}px`;
		dragState.element.style.top = `${coords.clientY - dragState.offset.y}px`;

		// Find insertion position based on mouse coordinates
		const insertionIndex = findInsertionPosition(coords.clientX, coords.clientY);

		// Show visual feedback for insertion position
		if (dragState.item) {
			const currentIndex = currentPreferences.findIndex((p) => p.id === dragState.item?.id);
			if (currentIndex !== -1 && insertionIndex !== currentIndex && insertionIndex !== currentIndex + 1) {
				dropIndicator = {
					targetIndex: insertionIndex > currentIndex ? insertionIndex - 1 : insertionIndex
				};
			} else {
				dropIndicator = null;
			}
		}

		// Clear grid drop indicator as we're using linear positioning
		gridDropIndicator = null;
	}

	function handleDragEnd() {
		if (!dragState.isActive) return;

		console.log('Drag end - dropIndicator:', dropIndicator, 'dragState.item:', dragState.item);

		const originalElement = mainContainerEl?.querySelector(`[data-widget-id="${dragState.item?.id}"]`) as HTMLElement;
		if (originalElement) {
			originalElement.style.opacity = '';
			originalElement.style.zIndex = '';
		}

		if (dragState.element) {
			document.body.removeChild(dragState.element);
		}

		// Handle repositioning based on drop indicator
		if (dropIndicator && dragState.item) {
			console.log('Performing drop with targetIndex:', dropIndicator.targetIndex);
			performDrop(dragState.item, dropIndicator);
		}

		dragState = { item: null, element: null, offset: { x: 0, y: 0 }, isActive: false };
		dropIndicator = null;
		gridDropIndicator = null;

		document.removeEventListener('pointermove', handleDragMove as EventListener);
	}

	onMount(() => {
		loadWidgetRegistry();
		if (data.pageData?.user) {
			systemPreferences.loadPreferences(data.pageData.user.id);
			// Ensure proper widget ordering after preferences load
			setTimeout(ensureWidgetOrder, 100);
		}
	});
</script>

<main bind:this={mainContainerEl} class="relative overflow-y-auto overflow-x-hidden" style="touch-action: pan-y;">
	<header class="mb-2 flex items-center justify-between gap-2 border-b border-surface-200 p-2 dark:border-surface-700">
		<PageTitle name="Dashboard" icon="bi:bar-chart-line" showBackButton={true} backUrl="/config" />
		<div class="flex items-center gap-2">
			<!-- Reset All Button - Small and subtle -->
			{#if currentPreferences.length > 0}
				<button class="variant-outline-surface btn-icon" onclick={resetAllWidgets} aria-label="Reset all widgets" title="Reset all widgets">
					<iconify-icon icon="mdi:refresh"></iconify-icon>
				</button>
			{/if}
			<!-- Add Widget Button -->
			<div class="relative">
				{#if availableWidgets.length > 0}
					<button
						class="variant-filled-primary btn"
						onclick={() => (dropdownOpen = !dropdownOpen)}
						aria-haspopup="true"
						aria-expanded={dropdownOpen}
						aria-label="Add Widget"
					>
						<iconify-icon icon="mdi:plus" class="mr-2"></iconify-icon>
						Add Widget
					</button>
				{/if}
				{#if dropdownOpen}
					<div
						class="widget-dropdown absolute right-0 z-30 mt-2 w-72 rounded border bg-white shadow-2xl dark:border-gray-700 dark:bg-surface-900"
						role="menu"
					>
						<div class="p-2">
							<input bind:this={searchInput} type="text" class="input w-full" placeholder="Search widgets..." bind:value={searchQuery} />
						</div>
						<div class="max-h-64 overflow-y-auto py-1">
							{#each filteredWidgets as widgetName (widgetName)}
								{@const widgetInfo = widgetComponentRegistry[widgetName]}
								<button
									class="flex w-full items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-primary-100 dark:hover:bg-primary-900/30"
									onclick={() => addNewWidget(widgetName)}
									title={widgetInfo?.description}
									role="menuitem"
								>
									<iconify-icon icon={widgetInfo?.icon || 'mdi:widgets'} class="text-primary-500"></iconify-icon>
									<div class="flex flex-col">
										<span>{widgetInfo?.name || widgetName}</span>
									</div>
								</button>
							{:else}
								<div class="px-4 py-2 text-sm text-gray-500">No widgets found.</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</div>
	</header>

	<div class="relative m-0 w-full p-0">
		<section class="w-full px-1 py-4">
			{#if !registryLoaded}
				<div role="status" class="flex h-full items-center justify-center text-lg text-gray-500">Loading...</div>
			{:else if currentPreferences.length > 0}
				<div class="responsive-dashboard-grid" role="grid">
					<!-- Grid drop indicator -->
					{#if gridDropIndicator}
						<div
							class="pointer-events-none absolute z-30 rounded-lg border-2 border-dashed border-primary-500 bg-primary-500/20"
							style:grid-column="span {gridDropIndicator.width}"
							style:grid-row="span {gridDropIndicator.height}"
							style:grid-column-start={gridDropIndicator.col + 1}
							style:grid-row-start={gridDropIndicator.row + 1}
						></div>
					{/if}

					{#each currentPreferences.sort((a, b) => (a.order || 0) - (b.order || 0)) as item (item.id)}
						{@const SvelteComponent = widgetComponentRegistry[item.component]?.component}
						<div
							role="button"
							tabindex="0"
							class="widget-container group relative select-none overflow-hidden rounded-lg border border-surface-200/80 bg-surface-50 shadow-sm transition-all duration-300 dark:border-surface-700 dark:bg-surface-800"
							data-widget-id={item.id}
							style:grid-column="span {item.size.w}"
							style:grid-row="span {item.size.h}"
							style:touch-action="manipulation"
							animate:flip={{ duration: 300 }}
							onpointerdown={(event) => handleDragStart(event, item, event.currentTarget)}
						>
							{#if SvelteComponent}
								<SvelteComponent
									{...item}
									theme={currentTheme}
									onSizeChange={(newSize: WidgetSize) => resizeWidget(item.id, newSize)}
									onCloseRequest={() => removeWidget(item.id)}
								/>
								{#if dropIndicator}
									{@const currentIndex = currentPreferences.findIndex((p) => p.id === item.id)}
									{@const isDropTarget = dropIndicator.targetIndex === currentIndex}
									{#if isDropTarget}
										<div class="pointer-events-none absolute inset-x-0 top-0 z-20 h-1 bg-primary-500" style:transform="translateY(-50%)"></div>
									{/if}
								{/if}
							{:else}
								<div class="flex h-full items-center justify-center p-4 text-error-500">Widget "{item.component}" not found.</div>
							{/if}
						</div>
					{/each}
				</div>
			{:else}
				<div class="mx-auto flex h-[60vh] w-full flex-col items-center justify-center text-center">
					<div class="flex flex-col items-center px-10 py-12">
						<iconify-icon icon="mdi:view-dashboard-outline" width="80" class="mb-6 text-primary-400 drop-shadow-lg dark:text-primary-500"
						></iconify-icon>
						<p class="mb-2 text-2xl font-bold text-primary-700 dark:text-primary-200">Your Dashboard is Empty</p>
						<p class="mb-6 text-base text-surface-600 dark:text-surface-300">Click below to add your first widget and get started.</p>
						<button
							class="btn rounded-full bg-primary-500 px-6 py-3 text-lg font-semibold text-white shadow-lg"
							onclick={() => (dropdownOpen = true)}
							aria-label="Add first widget"
						>
							<iconify-icon icon="mdi:plus" width="22" class="mr-2"></iconify-icon>
							Add Widget
						</button>
					</div>
				</div>
			{/if}
		</section>
	</div>
</main>

<style lang="postcss">
	.responsive-dashboard-grid {
		display: grid;
		gap: 1rem;
		grid-template-columns: repeat(4, 1fr);
		grid-auto-rows: 180px;
		grid-auto-flow: row dense;
		position: relative;
	}
</style>
