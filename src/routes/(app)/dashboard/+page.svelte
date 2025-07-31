<!--
@file src/routes/(app)/dashboard/+page.svelte
@component
**This file sets up and displays the dashboard page. It provides a user-friendly interface for managing system resources and system messages**

@example
<Dashboard />

### Props
- `data` {object} - Object containing user data

### Features
- Displays widgets for CPU usage, disk usage, memory usage, last 5 media, user activity, and system messages
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { modeCurrent } from '@skeletonlabs/skeleton';
	import { flip } from 'svelte/animate';

	// Stores
	import { systemPreferences } from '@stores/systemPreferences.svelte';
	import { screenSize } from '@stores/screenSizeStore.svelte';

	// Components
	import PageTitle from '@components/PageTitle.svelte';

	// --- Type Definitions ---
	type WidgetSize = '1/4' | '1/2' | '3/4' | 'full';
	type DropPosition = 'before' | 'after' | 'replace' | 'insert';

	// --- Constants & Props ---
	const HEADER_HEIGHT = 60; // The height of the draggable header area in pixels
	let {
		data: pageData
	}: { data: { user: { id: string }; availableWidgets?: Array<{ componentName: string; name: string; icon: string; description?: string }> } } =
		$props();

	// Dynamic widget registry state
	let widgetRegistry = $state<Record<string, { component: any; name: string; icon: string; description?: string }>>({});
	let registryLoaded = $state(false);

	// Load widgets dynamically
	async function loadWidgetRegistry() {
		const registry: Record<string, { component: any; name: string; icon: string; description?: string }> = {};
		try {
			const widgetModules = import.meta.glob('./widgets/*Widget.svelte');
			for (const [path, importFn] of Object.entries(widgetModules)) {
				const componentName = path.split('/').pop()?.replace('.svelte', '') || '';
				try {
					const module = (await importFn()) as any;
					const widgetMeta = module.widgetMeta;
					if (module.default && widgetMeta && widgetMeta.name && widgetMeta.icon) {
						const pageDataWidget = pageData?.availableWidgets?.find((w) => w.componentName === componentName);
						registry[componentName] = {
							component: module.default,
							name: widgetMeta.name,
							icon: widgetMeta.icon,
							description: pageDataWidget?.description || widgetMeta.description
						};
					}
				} catch (error) {
					console.error(`Error loading widget ${componentName}:`, error);
				}
			}
			widgetRegistry = registry;
		} catch (error) {
			console.error('Error loading widget registry:', error);
		} finally {
			registryLoaded = true;
		}
	}

	const widgetComponentRegistry = $derived(() => widgetRegistry);

	interface DashboardWidgetConfig {
		id: string;
		component: string;
		label: string;
		icon: string;
		size: WidgetSize;
		gridPosition?: number;
	}

	interface DropIndicator {
		index: number;
		position: DropPosition;
	}

	interface DragState {
		item: DashboardWidgetConfig | null;
		element: HTMLElement | null;
		offset: { x: number; y: number };
		isActive: boolean;
	}

	// --- State Management (Svelte 5 Runes) ---
	let items = $state<DashboardWidgetConfig[]>([]);
	let dropdownOpen = $state(false);
	let preferencesLoaded = $state(false);
	let previewSizes = $state<Record<string, WidgetSize>>({});
	let loadError = $state<string | null>(null);
	let searchQuery = $state('');
	let searchInput: HTMLInputElement | null = $state(null);
	let mainContainerEl: HTMLElement | null = $state(null);
	let dragState = $state<DragState>({ item: null, element: null, offset: { x: 0, y: 0 }, isActive: false });
	let dropIndicator = $state<DropIndicator | null>(null);

	// --- Utility Functions ---
	function getColumnSpan(size: WidgetSize): number {
		const spanMap: Record<WidgetSize, number> = { '1/4': 1, '1/2': 2, '3/4': 3, full: 4 };
		return spanMap[size] || 1;
	}

	function recalculateGridPositions(currentItems: DashboardWidgetConfig[]): DashboardWidgetConfig[] {
		// This function is simplified as grid-column handles positioning.
		// It's kept for potential future use where explicit position might be needed.
		return currentItems.map((item, index) => ({ ...item, gridPosition: index }));
	}

	// --- Derived State ---
	let positionedItems = $derived(recalculateGridPositions(items));
	let currentTheme: 'dark' | 'light' = $derived($modeCurrent ? 'dark' : 'light');
	let availableWidgets = $derived(Object.keys(widgetComponentRegistry()).filter((name) => !items.some((item) => item.component === name)));
	let filteredWidgets = $derived(availableWidgets.filter((name) => name.toLowerCase().includes(searchQuery.toLowerCase())));

	// --- Core Logic ---
	async function saveLayout() {
		try {
			const widgetPrefs = items.map((item) => ({
				id: item.id,
				component: item.component,
				label: item.label,
				icon: item.icon,
				size: item.size
			}));
			await systemPreferences.setPreference(pageData.user.id, widgetPrefs);
		} catch (err) {
			console.error('Failed to save layout:', err);
			loadError = 'Failed to save layout.';
		}
	}

	function addNewWidget(componentName: string) {
		const componentInfo = widgetComponentRegistry()[componentName];
		if (!componentInfo) return;

		const newItem: DashboardWidgetConfig = {
			id: `widget-${Math.random().toString(36).substring(2, 15)}-${Date.now().toString(36)}`,
			component: componentName,
			label: componentInfo.name,
			icon: componentInfo.icon,
			size: componentName === 'LogsWidget' ? '1/2' : '1/4'
		};
		items.push(newItem);
		dropdownOpen = false;
		searchQuery = '';
		saveLayout();
	}

	function removeWidget(id: string) {
		items = items.filter((item) => item.id !== id);
		saveLayout();
	}

	function resizeWidget(widgetId: string, newSize: WidgetSize) {
		const item = items.find((i) => i.id === widgetId);
		if (item) {
			item.size = newSize;
			saveLayout();
		}
	}

	function performDrop(draggedItem: DashboardWidgetConfig, indicator: DropIndicator) {
		const fromIndex = items.findIndex((i) => i.id === draggedItem.id);
		if (fromIndex === -1) return;

		let toIndex = indicator.index;

		// Create a mutable copy of the items array
		const newItems = [...items];

		// Remove the item from its original position
		const [movedItem] = newItems.splice(fromIndex, 1);

		// If the item was moved from an earlier position to a later one,
		// the target index in the new array (after removal) will be one less.
		if (fromIndex < toIndex) {
			toIndex--;
		}

		// Adjust index based on 'before' or 'after' drop position
		if (indicator.position === 'after') {
			toIndex++;
		}

		// Insert the item at the new position
		newItems.splice(toIndex, 0, movedItem);

		// Update the state and save
		items = newItems;
		saveLayout();
	}

	// --- Drag and Drop Handlers ---
	function handleDragStart(event: MouseEvent | TouchEvent, item: DashboardWidgetConfig, element: HTMLElement) {
		if (!!(event.target as HTMLElement).closest('button, a, input, select')) return;

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

		element.style.cssText += `opacity: 0.5; z-index: 1000;`;
		const clone = element.cloneNode(true) as HTMLElement;
		clone.style.cssText = `position: fixed; left: ${rect.left}px; top: ${rect.top}px; width: ${rect.width}px; height: ${rect.height}px; pointer-events: none; transform: scale(1.02); box-shadow: 0 20px 40px rgba(0,0,0,0.15); margin: 0;`;
		document.body.appendChild(clone);
		dragState.element = clone;

		document.addEventListener('mousemove', handleDragMove);
		document.addEventListener('mouseup', handleDragEnd, { once: true });
		document.addEventListener('touchmove', handleDragMove, { passive: false });
		document.addEventListener('touchend', handleDragEnd, { once: true });
	}

	function handleDragMove(event: MouseEvent | TouchEvent) {
		if (!dragState.isActive || !dragState.element) return;
		event.preventDefault();

		const coords = 'touches' in event ? event.touches[0] : event;
		dragState.element.style.left = `${coords.clientX - dragState.offset.x}px`;
		dragState.element.style.top = `${coords.clientY - dragState.offset.y}px`;

		const targetEl = document.elementFromPoint(coords.clientX, coords.clientY)?.closest('.widget-container');
		if (targetEl instanceof HTMLElement && targetEl.dataset.widgetId !== dragState.item?.id) {
			const targetId = targetEl.dataset.widgetId;
			const targetIndex = positionedItems.findIndex((p) => p.id === targetId);
			const targetRect = targetEl.getBoundingClientRect();
			const isAfter = coords.x > targetRect.left + targetRect.width / 2;

			if (targetIndex !== -1) {
				dropIndicator = { index: targetIndex, position: isAfter ? 'after' : 'before' };
				return;
			}
		}
		dropIndicator = null;
	}

	function handleDragEnd() {
		if (!dragState.isActive) return;

		const originalElement = mainContainerEl?.querySelector(`[data-widget-id="${dragState.item?.id}"]`) as HTMLElement;
		if (originalElement) {
			originalElement.style.opacity = '';
			originalElement.style.zIndex = '';
		}

		if (dragState.element) {
			document.body.removeChild(dragState.element);
		}

		if (dropIndicator && dragState.item) {
			performDrop(dragState.item, dropIndicator);
		}

		dragState = { item: null, element: null, offset: { x: 0, y: 0 }, isActive: false };
		dropIndicator = null;

		document.removeEventListener('mousemove', handleDragMove);
		document.removeEventListener('touchmove', handleDragMove);
	}

	// --- Lifecycle ---
	onMount(() => {
		// Trigger HMR to pick up new widgets
		loadWidgetRegistry();
		(async () => {
			try {
				await systemPreferences.loadPreferences(pageData.user.id);
				const currentState = systemPreferences.getState();

				while (!registryLoaded) {
					await new Promise((resolve) => setTimeout(resolve, 50));
				}

				const savedWidgets = currentState?.preferences || [];
				const validWidgets = savedWidgets
					.filter((w: any) => w && w.id && w.component && w.size && widgetComponentRegistry()[w.component])
					.map((w: any) => ({
						id: w.id,
						component: w.component,
						label: widgetComponentRegistry()[w.component]?.name || w.component,
						icon: widgetComponentRegistry()[w.component]?.icon || 'mdi:widgets',
						size: w.size
					}));
				items = validWidgets;
			} catch (err) {
				console.error('Failed to load preferences:', err);
				loadError = 'Could not load dashboard preferences.';
			} finally {
				preferencesLoaded = true;
			}
		})();
	});
</script>

<main bind:this={mainContainerEl} class="relative overflow-y-auto overflow-x-hidden" style="touch-action: pan-y;">
	<header class="mb-2 flex items-center justify-between gap-2 border-b border-surface-200 p-2 dark:border-surface-700">
		<PageTitle name="Dashboard" icon="bi:bar-chart-line" showBackButton={true} backUrl="/config" />
		<div class="flex items-center gap-2">
			<div class="relative">
				{#if availableWidgets.length > 0}
					<button
						class="variant-filled-primary btn {screenSize() === 'SM' || screenSize() === 'XS' ? 'btn-icon' : ''}"
						onclick={() => (dropdownOpen = !dropdownOpen)}
						aria-haspopup="true"
						aria-expanded={dropdownOpen}
						aria-label="Add Widget"
					>
						<iconify-icon icon="mdi:plus" class={screenSize() === 'SM' || screenSize() === 'XS' ? '' : 'mr-2'}></iconify-icon>
						{#if screenSize() !== 'SM' && screenSize() !== 'XS'}
							Add Widget
						{/if}
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
								{@const widgetInfo = widgetComponentRegistry()[widgetName]}
								<button
									class="flex w-full items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-primary-100 dark:hover:bg-primary-900/30"
									onclick={() => addNewWidget(widgetName)}
									title={widgetInfo?.description}
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
			{#if !preferencesLoaded || !registryLoaded}
				<div role="status" class="flex h-full items-center justify-center text-lg text-gray-500">Loading...</div>
			{:else if positionedItems.length > 0}
				<div class="responsive-dashboard-grid" role="grid">
					{#each positionedItems as item (item.id)}
						{@const SvelteComponent = widgetComponentRegistry()[item.component]?.component}
						{@const columnSpan = getColumnSpan(item.size)}
						<article
							class="widget-container group relative select-none overflow-hidden rounded-lg border border-surface-200/80 bg-surface-50 shadow-sm transition-all duration-300 dark:border-surface-700 dark:bg-surface-800"
							data-widget-id={item.id}
							style:grid-column="span {columnSpan}"
							style:touch-action="none"
							animate:flip={{ duration: 300 }}
							onmousedown={(event) => handleDragStart(event, item, event.currentTarget)}
							ontouchstart={(event) => handleDragStart(event, item, event.currentTarget)}
						>
							{#if SvelteComponent}
								<SvelteComponent
									{...item}
									theme={currentTheme}
									onSizeChange={(newSize: WidgetSize) => resizeWidget(item.id, newSize)}
									onCloseRequest={() => removeWidget(item.id)}
								/>
								{#if dropIndicator && positionedItems[dropIndicator.index]?.id === item.id}
									<div
										class="pointer-events-none absolute inset-y-0 z-20 w-1 bg-primary-500"
										style:left={dropIndicator.position === 'after' ? 'auto' : '0'}
										style:right={dropIndicator.position === 'after' ? '0' : 'auto'}
										style:transform="translateX({dropIndicator.position === 'after' ? '50%' : '-50%'})"
									></div>
								{/if}
							{:else}
								<div class="flex h-full items-center justify-center p-4 text-error-500">Widget "{item.component}" not found.</div>
							{/if}
						</article>
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
	/* Responsive dashboard grid */
	.responsive-dashboard-grid {
		display: grid;
		gap: 1rem;
		grid-template-columns: repeat(1, minmax(0, 1fr));
	}
	@media (min-width: 640px) {
		.responsive-dashboard-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (min-width: 1024px) {
		.responsive-dashboard-grid {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}
</style>
