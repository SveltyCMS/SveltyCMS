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
	import FirstLoginWelcome from '@components/admin/FirstLoginWelcome.svelte';
	import ImportExportManager from '@components/admin/ImportExportManager.svelte';
	import CPUWidget from './widgets/CPUWidget.svelte';
	import DiskWidget from './widgets/DiskWidget.svelte';
	import MemoryWidget from './widgets/MemoryWidget.svelte';
	import Last5MediaWidget from './widgets/Last5MediaWidget.svelte';
	import UserActivityWidget from './widgets/UserActivityWidget.svelte';
	import SystemMessagesWidget from './widgets/SystemMessagesWidget.svelte';
	import LogsWidget from './widgets/LogsWidget.svelte';
	import Last5ContentWidget from './widgets/Last5ContentWidget.svelte';
	import PerformanceWidget from './widgets/PerformanceWidget.svelte';

	// --- Type Definitions ---
	type WidgetSize = '1/4' | '1/2' | '3/4' | 'full';
	type DropPosition = 'before' | 'after' | 'replace' | 'insert';

	const widgetComponentRegistry = {
		CPUWidget: { component: CPUWidget, name: 'CPU Usage', icon: 'mdi:cpu-64-bit' },
		DiskWidget: { component: DiskWidget, name: 'Disk Usage', icon: 'mdi:harddisk' },
		MemoryWidget: { component: MemoryWidget, name: 'Memory Usage', icon: 'mdi:memory' },
		Last5ContentWidget: { component: Last5ContentWidget, name: 'Last 5 Content', icon: 'mdi:image-multiple' },
		Last5MediaWidget: { component: Last5MediaWidget, name: 'Last 5 Media', icon: 'mdi:image-multiple' },
		UserActivityWidget: { component: UserActivityWidget, name: 'User Activity', icon: 'mdi:account-group' },
		SystemMessagesWidget: { component: SystemMessagesWidget, name: 'System Messages', icon: 'mdi:message-alert' },
		LogsWidget: { component: LogsWidget, name: 'System Logs', icon: 'mdi:file-document-outline' },
		PerformanceWidget: { component: PerformanceWidget, name: 'Performance Monitor', icon: 'mdi:chart-line' }
	} as const;

	interface DashboardWidgetConfig {
		id: string;
		component: keyof typeof widgetComponentRegistry;
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

	// --- Constants & Props ---
	const HEADER_HEIGHT = 60;
	let { data: pageData }: { data: { user: { id: string; username?: string; email?: string; role?: string; isAdmin?: boolean } } } = $props();

	// --- State Management (Svelte 5 Runes) ---
	let items = $state<DashboardWidgetConfig[]>([]);
	let showFirstLoginWelcome = $state(false);
	let showImportExport = $state(false);
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

	function recalculateGridPositions(currentItems: DashboardWidgetConfig[], previews: Record<string, WidgetSize>): DashboardWidgetConfig[] {
		const grid = new Array(100).fill(null); // 4x25 grid
		let cursor = 0;
		return currentItems.map((item) => {
			const effectiveSize = previews[item.id] || item.size;
			const span = getColumnSpan(effectiveSize);
			while (grid[cursor] !== null) cursor++;
			const col = cursor % 4;
			if (col + span > 4) {
				cursor += 4 - col;
				while (grid[cursor] !== null) cursor++;
			}
			const newItem = { ...item, gridPosition: cursor };
			for (let i = 0; i < span; i++) {
				if (cursor + i < grid.length) {
					grid[cursor + i] = item.id;
				}
			}
			return newItem;
		});
	}

	// --- Derived State ---
	let positionedItems = $derived(recalculateGridPositions(items, previewSizes));
	let currentTheme: 'dark' | 'light' = $derived($modeCurrent ? 'dark' : 'light');
	let availableWidgets = $derived(
		(Object.keys(widgetComponentRegistry) as Array<keyof typeof widgetComponentRegistry>).filter(
			(name) => !items.some((item) => item.component === name)
		)
	);
	let filteredWidgets = $derived(availableWidgets.filter((name) => name.toLowerCase().includes(searchQuery.toLowerCase())));

	// --- Core Logic ---
	async function saveLayout() {
		try {
			const widgetPrefs = items.map((item) => ({
				...item,
				x: item.gridPosition ?? 0,
				y: 0,
				w: getColumnSpan(item.size),
				h: 1
			}));
			await systemPreferences.setPreference(pageData.user.id, widgetPrefs);
		} catch (err) {
			console.error('Failed to save layout:', err);
			loadError = 'Failed to save layout.';
		}
	}

	function addNewWidget(componentName: keyof typeof widgetComponentRegistry) {
		const componentInfo = widgetComponentRegistry[componentName];
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
			const newPreviews = { ...previewSizes };
			delete newPreviews[widgetId];
			previewSizes = newPreviews;
			saveLayout();
		}
	}

	function handlePreviewSizeChange(widgetId: string, previewSize: WidgetSize | null) {
		const item = items.find((i) => i.id === widgetId);
		if (!item) return;

		const newPreviews = { ...previewSizes };
		if (previewSize === null || previewSize === item.size) {
			delete newPreviews[widgetId];
		} else {
			newPreviews[widgetId] = previewSize;
		}
		previewSizes = newPreviews;
	}

	function performDrop(draggedItem: DashboardWidgetConfig, indicator: DropIndicator) {
		const fromIndex = items.findIndex((i) => i.id === draggedItem.id);
		let toIndex = indicator.index;
		if (fromIndex === -1 || fromIndex === toIndex) return;

		const newItems = [...items];
		const [movedItem] = newItems.splice(fromIndex, 1);

		if (fromIndex < toIndex) {
			const targetId = positionedItems[toIndex].id;
			toIndex = newItems.findIndex((i) => i.id === targetId);
		}

		newItems.splice(toIndex, 0, movedItem);
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
		element.style.cssText = `opacity: 0.8; transform: scale(1.02); z-index: 1000; position: fixed; pointer-events: none; width: ${rect.width}px; height: ${rect.height}px; box-shadow: 0 20px 40px rgba(0,0,0,0.15); transition: none;`;
		document.addEventListener('mousemove', handleDragMove);
		document.addEventListener('mouseup', handleDragEnd, { once: true });
		document.addEventListener('touchmove', handleDragMove, { passive: false });
		document.addEventListener('touchend', handleDragEnd, { once: true });
	}

	function handleDragMove(event: MouseEvent | TouchEvent) {
		if (!dragState.isActive || !dragState.element || !mainContainerEl) return;
		event.preventDefault();
		const coords = 'touches' in event ? event.touches[0] : event;
		const containerRect = mainContainerEl.getBoundingClientRect();
		const elRect = dragState.element.getBoundingClientRect();
		let newX = coords.clientX - dragState.offset.x;
		let newY = coords.clientY - dragState.offset.y;
		newX = Math.max(containerRect.left, Math.min(newX, containerRect.right - elRect.width));
		newY = Math.max(containerRect.top, Math.min(newY, containerRect.bottom - elRect.height));
		dragState.element.style.left = `${newX}px`;
		dragState.element.style.top = `${newY}px`;

		// Update drop indicator
		const targetEl = document.elementFromPoint(coords.clientX, coords.clientY)?.closest('.widget-container');
		if (targetEl instanceof HTMLElement && targetEl.dataset.gridIndex) {
			const targetIndex = parseInt(targetEl.dataset.gridIndex, 10);
			if (positionedItems[targetIndex]?.id !== dragState.item?.id) {
				dropIndicator = { index: targetIndex, position: 'replace' };
				return;
			}
		}
		dropIndicator = null;
	}

	function handleDragEnd() {
		if (!dragState.isActive) return;
		if (dragState.element) dragState.element.style.cssText = '';
		if (dropIndicator && dragState.item) performDrop(dragState.item, dropIndicator);
		dragState = { item: null, element: null, offset: { x: 0, y: 0 }, isActive: false };
		dropIndicator = null;
		document.removeEventListener('mousemove', handleDragMove);
		document.removeEventListener('touchmove', handleDragMove);
	}

	// --- Lifecycle ---
	onMount(() => {
		(async () => {
			try {
				// Check if this is a first-time admin login
				const hasSeenWelcome = localStorage.getItem('sveltycms-welcome-seen');
				const isAdmin = pageData.user?.isAdmin || pageData.user?.role === 'admin';

				if (isAdmin && !hasSeenWelcome) {
					showFirstLoginWelcome = true;
				}

				await systemPreferences.loadPreferences(pageData.user.id);
				const currentState = systemPreferences.getState();
				const loadedWidgets = (currentState?.preferences || [])
					.filter(
						(w: any): w is DashboardWidgetConfig =>
							w && w.id && w.component && w.size && widgetComponentRegistry[w.component as keyof typeof widgetComponentRegistry]
					)
					.map((w: any) => ({
						...w,
						label: w.label || widgetComponentRegistry[w.component].name,
						icon: w.icon || widgetComponentRegistry[w.component].icon
					}));
				items = loadedWidgets;
			} catch (err) {
				console.error('Failed to load preferences:', err);
				loadError = 'Could not load dashboard preferences.';
			} finally {
				preferencesLoaded = true;
			}
		})();
	});
</script>

<!-- First Login Welcome Modal -->
{#if showFirstLoginWelcome}
	<FirstLoginWelcome user={pageData.user} bind:showWelcome={showFirstLoginWelcome} />
{/if}

<main bind:this={mainContainerEl} class="relative overflow-x-hidden" style="touch-action: pan-y;">
	<header class="mb-2 flex items-center justify-between gap-2 border-b border-surface-200 p-2 dark:border-surface-700">
		<PageTitle name="Dashboard" icon="bi:bar-chart-line" showBackButton={true} backUrl="/config" />
		<div class="flex items-center gap-2">
			<!-- Import/Export Button -->
			<button class="variant-outline-primary btn" onclick={() => (showImportExport = true)} title="Import and Export Collections Data">
				<iconify-icon icon="mdi:database-import" class="mr-2"></iconify-icon>
				Import/Export
			</button>

			<div class="relative">
				<button class="variant-filled-primary btn" onclick={() => (dropdownOpen = !dropdownOpen)} aria-haspopup="true" aria-expanded={dropdownOpen}>
					<iconify-icon icon="mdi:plus" class="mr-2"> </iconify-icon>
					Add Widget
				</button>
				{#if dropdownOpen}
					<div
						class="widget-dropdown absolute right-0 z-30 mt-2 w-72 rounded-xl border bg-white shadow-2xl dark:border-gray-700 dark:bg-surface-900"
						role="menu"
					>
						<div class="p-2">
							<input bind:this={searchInput} type="text" class="input w-full" placeholder="Search widgets..." bind:value={searchQuery} />
						</div>
						<div class="max-h-64 overflow-y-auto py-1">
							{#each filteredWidgets as widgetName (widgetName)}
								<button
									class="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-primary-100 dark:hover:bg-primary-900/30"
									onclick={() => addNewWidget(widgetName)}
								>
									<iconify-icon icon={widgetComponentRegistry[widgetName].icon} class="text-primary-500"></iconify-icon>
									<span>{widgetComponentRegistry[widgetName].name}</span>
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
			{#if !preferencesLoaded}
				<div role="status" class="flex h-full items-center justify-center text-lg text-gray-500">Loading preferences...</div>
			{:else if positionedItems.length > 0}
				<div class="responsive-dashboard-grid" role="grid">
					{#each positionedItems as item, index (item.id)}
						{@const SvelteComponent = widgetComponentRegistry[item.component]?.component}
						{@const effectiveSize = previewSizes[item.id] || item.size}
						{@const columnSpan = getColumnSpan(effectiveSize)}
						<article
							class="widget-container group relative select-none overflow-hidden rounded-lg border border-surface-200/80 bg-surface-50 shadow-sm transition-all duration-300 dark:border-surface-700 dark:bg-surface-800"
							data-grid-index={index}
							style="grid-column: span {columnSpan}; touch-action: none;"
							animate:flip={{ duration: 300 }}
						>
							{#if SvelteComponent}
								<SvelteComponent
									{...item}
									theme={currentTheme}
									onSizeChange={(newSize: WidgetSize) => resizeWidget(item.id, newSize)}
									onPreviewSizeChange={(previewSize: WidgetSize | null) => handlePreviewSizeChange(item.id, previewSize)}
									onCloseRequest={() => removeWidget(item.id)}
									onDragStart={(event: MouseEvent | TouchEvent, element: HTMLElement) => handleDragStart(event, item, element)}
								/>
								{#if dropIndicator && dropIndicator.index === index}
									<div
										class="pointer-events-none absolute inset-0 z-20 animate-pulse rounded-lg border-2 border-dashed border-primary-500 bg-primary-500/20"
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

<!-- Import/Export Modal -->
{#if showImportExport}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
		<div class="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-lg bg-surface-50 shadow-xl dark:bg-surface-800">
			<div class="flex items-center justify-between border-b p-6">
				<h3 class="text-xl font-semibold">Data Import & Export</h3>
				<button onclick={() => (showImportExport = false)} class="variant-ghost btn btn-sm">
					<iconify-icon icon="mdi:close" class="h-5 w-5"></iconify-icon>
				</button>
			</div>

			<div class="max-h-[calc(90vh-140px)] overflow-y-auto p-6">
				<ImportExportManager />
			</div>

			<div class="flex items-center justify-between border-t bg-surface-100 p-6 dark:bg-surface-700">
				<div class="text-sm text-gray-600 dark:text-gray-400">
					<iconify-icon icon="mdi:shield-check" class="mr-1 inline h-4 w-4"></iconify-icon>
					Your data is securely managed and never leaves your server
				</div>
				<div class="flex space-x-2">
					<button onclick={() => (showImportExport = false)} class="variant-filled-primary btn"> Done </button>
				</div>
			</div>
		</div>
	</div>
{/if}

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
