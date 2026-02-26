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
- Lazy loading with Intersection Observer for optimal performance
-->
<script lang="ts">
	import ImportExportManager from '@src/components/admin/import-export-manager.svelte';
	// Components
	import PageTitle from '@src/components/page-title.svelte';
	import Slot from '@src/components/system/Slot.svelte';
	import type { DashboardWidgetConfig, DropIndicator, WidgetComponent, WidgetMeta, WidgetSize } from '@src/content/types';
	import { onMount } from 'svelte';
	import { flip } from 'svelte/animate';
	import { SvelteMap } from 'svelte/reactivity';
	// Types
	import type { PageData } from './$types';

	// Using iconify-icon web component

	import { systemPreferences } from '@src/stores/system-preferences.svelte.ts';
	// Stores
	import { themeStore } from '@src/stores/theme-store.svelte.ts';

	// System logger
	import { logger } from '@utils/logger';

	// Lucide Icons

	const { data }: { data: PageData } = $props();

	// Define the types for the widget registry
	interface WidgetRegistryEntry {
		component: any;
		description: string;
		icon: string;
		name: string;
		widgetMeta: WidgetMeta;
	}
	type WidgetRegistry = Record<string, WidgetRegistryEntry>;

	const MAX_COLUMNS = 4;
	const MAX_ROWS = 4;
	const HEADER_HEIGHT = 48; // Approx height of widget header

	let mainContainerEl: HTMLElement | null = $state(null);
	let dropdownOpen = $state(false);
	let searchQuery = $state('');
	let registryLoaded = $state(false);
	let widgetRegistry: WidgetRegistry = $state({});

	// Lazy loading state for widgets
	let loadedWidgets = new SvelteMap<string, any>();
	const widgetObservers = new SvelteMap<string, IntersectionObserver>();

	let showImportExport = $state(false);

	let dragState: {
		item: DashboardWidgetConfig | null;
		element: HTMLElement | null;
		offset: { x: number; y: number };
		isActive: boolean;
		gridPosition?: { row: number; col: number };
	} = $state({
		item: null,
		element: null,
		offset: { x: 0, y: 0 },
		isActive: false
	});
	let dropIndicator: DropIndicator | null = $state(null);
	let gridDropIndicator: {
		row: number;
		col: number;
		width: number;
		height: number;
	} | null = $state(null);

	async function loadWidgetRegistry() {
		const modules = import.meta.glob('./widgets/*.svelte');
		const registry: typeof widgetRegistry = {};
		for (const path in modules) {
			if (Object.hasOwn(modules, path)) {
				const name = path.split('/').pop()?.replace('.svelte', '');
				if (name) {
					const module = (await modules[path]()) as {
						default: WidgetComponent;
						widgetMeta: WidgetMeta;
					};
					registry[name] = {
						component: module.default,
						name: module.widgetMeta?.name || name,
						description: module.widgetMeta?.description || '',
						icon: module.widgetMeta?.icon || 'mdi:widgets',
						widgetMeta: module.widgetMeta
					};
				}
			}
		}
		widgetRegistry = registry;
		registryLoaded = true;
	}

	// Lazy load individual widget when it becomes visible
	async function loadWidgetComponent(widgetId: string, componentName: string) {
		// Skip if already loaded
		if (loadedWidgets.has(widgetId)) {
			return;
		}

		try {
			// Dynamically import the widget component
			const module = await import(`./widgets/${componentName}.svelte`);
			loadedWidgets.set(widgetId, module.default);
		} catch (error) {
			logger.error(`Failed to load widget: ${componentName}`, error);
			loadedWidgets.set(widgetId, null); // Mark as failed
		}
	}

	// Setup intersection observer for lazy loading (Svelte action)
	function setupWidgetObserver(element: HTMLElement, params: [string, string]) {
		const [widgetId, componentName] = params;

		const observer = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					if (entry.isIntersecting && !loadedWidgets.has(widgetId)) {
						loadWidgetComponent(widgetId, componentName);
						observer.disconnect();
						widgetObservers.delete(widgetId);
					}
				});
			},
			{ rootMargin: '100px' } // Start loading 100px before visible
		);

		observer.observe(element);
		widgetObservers.set(widgetId, observer);

		return {
			destroy() {
				observer.disconnect();
				widgetObservers.delete(widgetId);
			}
		};
	}

	const widgetComponentRegistry = $derived(widgetRegistry);
	const currentPreferences = $derived(systemPreferences.preferences || []);
	const availableWidgets = $derived(
		registryLoaded && currentPreferences
			? Object.keys(widgetComponentRegistry).filter((name) => !currentPreferences.some((item: DashboardWidgetConfig) => item.component === name))
			: []
	);
	const filteredWidgets = $derived(availableWidgets.filter((name) => name.toLowerCase().includes(searchQuery.toLowerCase())));

	const currentTheme: 'dark' | 'light' = $derived(themeStore.isDarkMode ? 'dark' : 'light');

	// Helper function to find insertion position based on coordinates
	function findInsertionPosition(x: number, y: number): number {
		const gridContainer = mainContainerEl?.querySelector('.responsive-dashboard-grid') as HTMLElement;
		if (!gridContainer) {
			return currentPreferences.length;
		}

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
		let minDistance = Number.POSITIVE_INFINITY;

		for (let i = 0; i <= widgetPositions.length; i++) {
			let targetY = 0;
			let targetX = 0;

			if (i === 0) {
				// Before first widget
				targetY = widgetPositions[0]?.centerY || 0;
				targetX = widgetPositions[0]?.centerX || 0;
			} else if (i === widgetPositions.length) {
				// After last widget
				const lastWidget = widgetPositions.at(-1);
				targetY = lastWidget?.centerY || relativeY;
				targetX = lastWidget?.centerX || relativeX;
			} else {
				// Between widgets
				const prevWidget = widgetPositions[i - 1];
				const nextWidget = widgetPositions[i];
				targetY = (prevWidget.centerY + nextWidget.centerY) / 2;
				targetX = (prevWidget.centerX + nextWidget.centerX) / 2;
			}

			const distance = Math.sqrt((relativeX - targetX) ** 2 + (relativeY - targetY) ** 2);

			if (distance < minDistance) {
				minDistance = distance;
				insertIndex = i;
			}
		}

		return insertIndex;
	}

	// Ensure all widgets have proper order values
	function ensureWidgetOrder() {
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
			systemPreferences.updateWidgets(widgets);
		}
	}

	function addNewWidget(componentName: string) {
		const componentInfo = widgetComponentRegistry[componentName];
		if (!componentInfo) {
			logger.error(`SveltyCMS: Widget component info for "${componentName}" not found in registry.`);
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
		systemPreferences.updateWidget(newItem);
		dropdownOpen = false;
		searchQuery = '';
	}

	function removeWidget(id: string) {
		systemPreferences.removeWidget(id);
		// Clean up loaded widget and observer
		loadedWidgets.delete(id);
		const observer = widgetObservers.get(id);
		if (observer) {
			(observer as any).disconnect();
			widgetObservers.delete(id);
		}
	}

	function resetAllWidgets() {
		systemPreferences.setPreferences([]);
		// Clean up all loaded widgets and observers
		loadedWidgets.clear();
		widgetObservers.forEach((observer: any) => observer.disconnect());
		widgetObservers.clear();
	}

	function resizeWidget(widgetId: string, newSize: WidgetSize) {
		const item = currentPreferences.find((i: DashboardWidgetConfig) => i.id === widgetId);
		if (item) {
			const updatedSize = {
				w: Math.max(1, Math.min(MAX_COLUMNS, newSize.w)),
				h: Math.max(1, Math.min(MAX_ROWS, newSize.h))
			};
			systemPreferences.updateWidget({ ...item, size: updatedSize });
		}
	}

	function performDrop(widget: DashboardWidgetConfig, indicator: { targetIndex: number }) {
		const currentWidgets = [...currentPreferences];
		const currentIndex = currentWidgets.findIndex((w) => w.id === widget.id);

		if (currentIndex === -1) {
			return;
		}

		// Remove from current position
		const [movedWidget] = currentWidgets.splice(currentIndex, 1);

		// Insert at new position
		currentWidgets.splice(indicator.targetIndex, 0, movedWidget);

		// Update order property for all widgets and save them as a batch
		const updatedWidgets = currentWidgets.map((w, index) => ({
			...w,
			order: index
		}));

		systemPreferences.updateWidgets(updatedWidgets);
	}
	function handleDragStart(event: MouseEvent | TouchEvent | PointerEvent, item: DashboardWidgetConfig, element: HTMLElement) {
		// Ignore clicks on interactive elements and resize handles
		if ((event.target as HTMLElement).closest('button, a, input, select, [role=button], .resize-handles, [data-direction]')) {
			return;
		}

		const coords = 'touches' in event ? event.touches[0] : event;
		const rect = element.getBoundingClientRect();

		if (coords.clientY - rect.top > HEADER_HEIGHT) {
			return;
		}

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
		document.addEventListener('pointermove', handleDragMove, { passive: true });
		document.addEventListener('pointerup', handleDragEnd, { once: true });
	}

	function handleDragMove(event: PointerEvent) {
		if (!(dragState.isActive && dragState.element)) {
			return;
		}

		const coords = event;
		dragState.element.style.left = `${coords.clientX - dragState.offset.x}px`;
		dragState.element.style.top = `${coords.clientY - dragState.offset.y}px`;

		// Find insertion position based on mouse coordinates
		const insertionIndex = findInsertionPosition(coords.clientX, coords.clientY);

		// Show visual feedback for insertion position
		if (dragState.item) {
			const currentIndex = currentPreferences.findIndex((p: DashboardWidgetConfig) => p.id === dragState.item?.id);
			if (currentIndex !== -1 && insertionIndex !== currentIndex && insertionIndex !== currentIndex + 1) {
				dropIndicator = {
					show: true,
					position: insertionIndex,
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
		if (!dragState.isActive) {
			return;
		}

		const originalElement = mainContainerEl?.querySelector(`[data-widget-id="${dragState.item?.id}"]`) as HTMLElement;
		if (originalElement) {
			originalElement.style.opacity = '';
			originalElement.style.zIndex = '';
		}

		if (dragState.element) {
			document.body.removeChild(dragState.element);
		}

		// Handle repositioning based on drop indicator
		if (dropIndicator && dragState.item && dropIndicator.targetIndex !== undefined) {
			performDrop(dragState.item, { targetIndex: dropIndicator.targetIndex });
		}

		dragState = {
			item: null,
			element: null,
			offset: { x: 0, y: 0 },
			isActive: false
		};
		dropIndicator = null;
		gridDropIndicator = null;

		document.removeEventListener('pointermove', handleDragMove);
	}

	// Keyboard Reordering
	function handleWidgetKeydown(event: KeyboardEvent, item: DashboardWidgetConfig) {
		const currentWidgets = [...currentPreferences];
		const currentIndex = currentWidgets.findIndex((w) => w.id === item.id);

		if (currentIndex === -1) {
			return;
		}

		let targetIndex = currentIndex;

		if (event.ctrlKey || event.metaKey) {
			if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
				event.preventDefault();
				targetIndex = Math.max(0, currentIndex - 1);
			} else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
				event.preventDefault();
				targetIndex = Math.min(currentWidgets.length - 1, currentIndex + 1);
			}
		}

		if (targetIndex !== currentIndex) {
			// Perform swap/move
			const [movedWidget] = currentWidgets.splice(currentIndex, 1);
			currentWidgets.splice(targetIndex, 0, movedWidget);

			const updatedWidgets = currentWidgets.map((w, index) => ({
				...w,
				order: index
			}));

			systemPreferences.updateWidgets(updatedWidgets);

			// Maintain focus on the moved widget
			setTimeout(() => {
				const el = document.querySelector(`[data-widget-id="${item.id}"]`) as HTMLElement;
				el?.focus();
			}, 50);
		}
	}

	onMount(() => {
		loadWidgetRegistry();
		systemPreferences.loadPreferences();
		// Ensure proper widget ordering after preferences load
		setTimeout(ensureWidgetOrder, 100);

		// Cleanup observers on unmount
		return () => {
			widgetObservers.forEach((observer: any) => observer.disconnect());
			widgetObservers.clear();
		};
	});
</script>

<main bind:this={mainContainerEl} class="relative overflow-y-auto overflow-x-hidden" style="touch-action: pan-y;">
	<header class="mb-2 flex items-center justify-between gap-2 border-b border-surface-200 p-2 dark:text-surface-50">
		<PageTitle name="Dashboard" icon="bi:bar-chart-line" showBackButton={true} backUrl="/config" />
		<div class="flex items-center gap-2">
			<!-- Reset All Button - Small and subtle -->
			{#if currentPreferences.length > 0}
				<button class="preset-outlined-surface-500 btn-icon" onclick={resetAllWidgets} aria-label="Reset all widgets" title="Reset all widgets">
					<iconify-icon icon="mdi:refresh" width={20}></iconify-icon>
				</button>
			{/if}
			<!-- Add Widget Button -->
			<div class="relative">
				{#if availableWidgets.length > 0}
					<button
						class="preset-filled-tertiary-500 btn dark:preset-filled-primary-500"
						onclick={() => (dropdownOpen = !dropdownOpen)}
						aria-haspopup="true"
						aria-expanded={dropdownOpen}
						aria-label="Add Widget"
					>
						<iconify-icon icon="mdi:plus" width={18} class="mr-2"></iconify-icon>
						Add Widget
					</button>
				{/if}
				{#if dropdownOpen}
					<div
						class="widget-dropdown absolute right-0 z-30 mt-2 w-72 rounded border bg-white shadow-2xl dark:border-gray-700 dark:bg-surface-900"
						role="menu"
					>
						<div class="p-2"><input type="text" class="input w-full" placeholder="Search widgets..." bind:value={searchQuery} /></div>
						<div class="max-h-64 overflow-y-auto py-1">
							{#each filteredWidgets as widgetName (widgetName)}
								{@const widgetInfo = widgetComponentRegistry[widgetName]}
								<button
									class="flex w-full items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-primary-100 dark:hover:bg-primary-900/30"
									onclick={() => addNewWidget(widgetName)}
									title={widgetInfo?.description}
									role="menuitem"
								>
									{#if widgetInfo?.icon}
										<iconify-icon icon={widgetInfo.icon} width="20" class="text-primary-500"></iconify-icon>
									{:else}
										<iconify-icon icon="mdi:view-dashboard" width={20} class="text-primary-500"></iconify-icon>
									{/if}
									<div class="flex flex-col"><span>{widgetInfo?.name || widgetName}</span></div>
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
			{#if currentPreferences.length > 0}
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

					{#each currentPreferences.sort((a: DashboardWidgetConfig, b: DashboardWidgetConfig) => (a.order || 0) - (b.order || 0)) as item (item.id)}
						{@const widgetName = item.label || item.component}
						{@const WidgetComponent = widgetRegistry[item.component]?.component}
						<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
						<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
						<div
							role="article"
							aria-label="{widgetName} widget. Press Ctrl + Arrow keys to reorder."
							tabindex="0"
							class="widget-container group relative select-none overflow-hidden rounded-lg border border-surface-200/80 bg-surface-50 shadow-sm transition-all duration-300 dark:text-surface-50 dark:bg-surface-800 focus:ring-2 focus:ring-primary-500 focus:outline-none"
							data-widget-id={item.id}
							style:grid-column="span {item.size.w}"
							style:grid-row="span {item.size.h}"
							style:touch-action="manipulation"
							style:min-height="{item.size.h * 180}px"
							animate:flip={{ duration: 300 }}
							onpointerdown={(event) => handleDragStart(event, item, event.currentTarget)}
							onkeydown={(event) => handleWidgetKeydown(event, item)}
							use:setupWidgetObserver={[item.id, item.component]}
						>
							{#if !WidgetComponent}
								<!-- Loading skeleton -->
								<div class="widget-skeleton h-full animate-pulse">
									<div class="mb-2 h-12 rounded-t bg-surface-300 dark:bg-surface-700"></div>
									<div class="h-full rounded-b bg-surface-200 p-4 dark:bg-surface-800">
										<div class="mb-3 h-8 rounded bg-surface-300 dark:bg-surface-700"></div>
										<div class="mb-2 h-6 w-3/4 rounded bg-surface-300 dark:bg-surface-700"></div>
										<div class="mb-2 h-6 w-1/2 rounded bg-surface-300 dark:bg-surface-700"></div>
									</div>
								</div>
							{:else if WidgetComponent === null}
								<!-- Error state -->
								<div class="card preset-ghost-error-500 flex h-full flex-col items-center justify-center p-4">
									<iconify-icon icon="mdi:alert-circle" width={48} class="mb-2 text-error-500"></iconify-icon>
									<h3 class="h4 mb-2">Widget Load Error</h3>
									<p class="text-sm">Failed to load: {item.component}</p>
									<button class="preset-filled-error-500 btn-sm mt-4" onclick={() => removeWidget(item.id)}>Remove Widget</button>
								</div>
							{:else}
								<!-- Render the actual widget - Svelte 5 dynamic components -->
								<WidgetComponent
									config={item}
									onRemove={() => removeWidget(item.id)}
									onSizeChange={(newSize: WidgetSize) => resizeWidget(item.id, newSize)}
									theme={currentTheme}
									currentUser={data.pageData?.user}
								/>
							{/if}
							{#if dropIndicator}
								{@const currentIndex = currentPreferences.findIndex((p: DashboardWidgetConfig) => p.id === item.id)}
								{@const isDropTarget = dropIndicator.targetIndex === currentIndex}
								{#if isDropTarget}
									<div class="pointer-events-none absolute inset-x-0 top-0 z-20 h-1 bg-primary-500" style:transform="translateY(-50%)"></div>
								{/if}
							{/if}
						</div>
					{/each}
				</div>
			{:else}
				<div class="mx-auto flex h-[60vh] w-full flex-col items-center justify-center text-center">
					<div class="flex flex-col items-center px-10 py-12">
						<iconify-icon icon="mdi:view-dashboard" width={80} class="mb-6 text-tertiary-500 drop-shadow-lg dark:text-primary-500"></iconify-icon>
						<p class="mb-2 text-2xl font-bold text-tertiary-500 dark:text-primary-500">Your Dashboard is Empty</p>
						<p class="mb-6 text-base text-surface-600 dark:text-surface-300">Click below to add your first widget and get started.</p>
						<button
							class="btn rounded-full bg-tertiary-500 px-6 py-3 text-lg font-semibold text-white shadow-lg dark:bg-primary-500"
							onclick={() => (dropdownOpen = true)}
							aria-label="Add first widget"
						>
							<iconify-icon icon="mdi:plus" width={22} class="mr-2"></iconify-icon>
							Add Widget
						</button>
					</div>
				</div>
			{/if}

			<!-- Dashboard Injection Zone -->
			<section class="w-full px-4 mb-8"><Slot name="dashboard" /></section>
		</section>
	</div>
</main>

<!-- Import/Export Modal -->
{#if showImportExport}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
		<div class="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-lg bg-surface-50 shadow-xl dark:bg-surface-800">
			<div class="flex items-center justify-between border-b p-6">
				<h3 class="text-xl font-semibold">Data Import & Export</h3>
				<button onclick={() => (showImportExport = false)} class="preset-ghost btn-sm" aria-label="Close import/export modal">
					<iconify-icon icon="mdi:close" width={20}></iconify-icon>
				</button>
			</div>

			<div class="max-h-[calc(90vh-140px)] overflow-y-auto p-6"><ImportExportManager /></div>

			<div class="flex items-center justify-between border-t bg-surface-100 p-6 dark:bg-surface-700">
				<div class="text-sm text-gray-600 dark:text-gray-400">
					<iconify-icon icon="mdi:shield-check" width={16} class="mr-1 inline"></iconify-icon>
					Your data is securely managed and never leaves your server
				</div>
				<div class="flex space-x-2"><button onclick={() => (showImportExport = false)} class="preset-filled-primary-500 btn">Done</button></div>
			</div>
		</div>
	</div>
{/if}

<style>
	.responsive-dashboard-grid {
		position: relative;
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		grid-auto-rows: 180px;
		grid-auto-flow: row dense;
		gap: 1rem;
	}
</style>
