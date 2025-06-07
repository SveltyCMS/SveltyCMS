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
	import { flip } from 'svelte/animate';
	import { dndzone } from 'svelte-dnd-action'; // For drag and drop
	import { modeCurrent } from '@skeletonlabs/skeleton';

	// Stores
	import { systemPreferences, type WidgetPreference } from '@stores/systemPreferences.svelte';
	import { screenSize, type ScreenSize } from '@stores/screenSizeStore.svelte'; // Assuming ScreenSize is exported

	// Components
	import PageTitle from '@components/PageTitle.svelte';
	// BaseWidget is used by CPUWidget, DiskWidget etc. It doesn't need to be directly called in this script.
	// import BaseWidget from './BaseWidget.svelte';
	import CPUWidget from './widgets/CPUWidget.svelte';
	import DiskWidget from './widgets/DiskWidget.svelte';
	import MemoryWidget from './widgets/MemoryWidget.svelte';
	import Last5MediaWidget from './widgets/Last5MediaWidget.svelte';
	import UserActivityWidget from './widgets/UserActivityWidget.svelte';
	import SystemMessagesWidget from './widgets/SystemMessagesWidget.svelte';
	import LogsWidget from './widgets/LogsWidget.svelte'; // Import the new Logs Widget

	const ROW_HEIGHT = 100;
	const GAP_SIZE = 16;
	const DND_OPTIONS = { flipDurationMs: 200 };

	interface Props {
		data: { user: { id: string } };
	}
	let { data: pageData }: Props = $props();

	// Ensure WidgetPreference in @stores/systemPreferences.svelte includes 'icon: string;'
	// and all other fields expected by DashboardWidgetConfig.
	type DashboardWidgetConfig = WidgetPreference & {
		// Explicitly list all expected fields if WidgetPreference is too generic or for clarity
		// For example, if WidgetPreference might not have 'icon', but DashboardWidgetConfig always does:
		icon: string;
		// Add other fields if they are guaranteed here but optional in WidgetPreference
	};

	// Define what the structure of preferences from the store looks like.
	// It's an object where keys are screen sizes (e.g., 'sm', 'md') and values are widget arrays.
	type PreferencesState = Partial<Record<ScreenSize, WidgetPreference[]>>;

	let items: DashboardWidgetConfig[] = $state([]);
	let dropdownOpen = $state(false);
	let gridElement: HTMLElement | undefined = $state();
	let draggedItemId: string | null = $state(null);
	let preferencesLoaded = $state(false);

	let currentScreenSize = $derived($screenSize);
	let cols = $derived(currentScreenSize === 'sm' ? 2 : currentScreenSize === 'md' ? 3 : 4);
	let gridCellWidth = $state(0);

	const widgetComponentRegistry: Record<
		string,
		{
			component: any;
			name: string;
			icon: string; // Icon is used for the "Add Widget" dropdown
			defaultW: number;
			defaultH: number;
			minW?: number;
			minH?: number;
			validSizes?: { w: number; h: number }[];
		}
	> = {
		CPUWidget: {
			component: CPUWidget,
			name: 'CPU Usage',
			icon: 'mdi:cpu-64-bit',
			defaultW: 2,
			defaultH: 2,
			minW: 1,
			minH: 1,
			validSizes: [
				{ w: 1, h: 1 },
				{ w: 2, h: 1 },
				{ w: 1, h: 2 },
				{ w: 2, h: 2 }
			]
		},
		DiskWidget: { component: DiskWidget, name: 'Disk Usage', icon: 'mdi:harddisk', defaultW: 1, defaultH: 1, minW: 1, minH: 1 },
		MemoryWidget: { component: MemoryWidget, name: 'Memory Usage', icon: 'mdi:memory', defaultW: 1, defaultH: 2, minW: 1, minH: 1 },
		Last5MediaWidget: { component: Last5MediaWidget, name: 'Last 5 Media', icon: 'mdi:image-multiple', defaultW: 2, defaultH: 2, minW: 1, minH: 2 },
		UserActivityWidget: {
			component: UserActivityWidget,
			name: 'User Activity',
			icon: 'mdi:account-group',
			defaultW: 2,
			defaultH: 1,
			minW: 2,
			minH: 1
		},
		SystemMessagesWidget: {
			component: SystemMessagesWidget,
			name: 'System Messages',
			icon: 'mdi:message-alert',
			defaultW: 2,
			defaultH: 2,
			minW: 1,
			minH: 1
		},
		LogsWidget: {
			// New Logs Widget
			component: LogsWidget,
			name: 'System Logs',
			icon: 'mdi:file-document-outline',
			defaultW: 4, // Make it wider by default for better log display
			defaultH: 3, // Make it taller by default
			minW: 2,
			minH: 2
		}
	};

	$effect(() => {
		if (gridElement && cols > 0) {
			const containerWidth = gridElement.clientWidth;
			gridCellWidth = (containerWidth - (cols - 1) * GAP_SIZE) / cols;
		}
	});

	let resizeObserver: ResizeObserver | null = null;
	$effect(() => {
		if (gridElement) {
			resizeObserver = new ResizeObserver((entries) => {
				if (entries[0] && cols > 0) {
					const containerWidth = entries[0].contentRect.width;
					gridCellWidth = (containerWidth - (cols - 1) * GAP_SIZE) / cols;
				}
			});
			resizeObserver.observe(gridElement);
		}
		return () => {
			if (resizeObserver && gridElement) resizeObserver.unobserve(gridElement);
			resizeObserver = null;
		};
	});

	onMount(async () => {
		try {
			await systemPreferences.loadPreferences(pageData.user.id);
			// Cast $systemPreferences to the expected PreferencesState type
			const prefsState = $systemPreferences as PreferencesState;

			// Use the derived currentScreenSize for indexing
			const loadedRawItems: WidgetPreference[] = prefsState?.[currentScreenSize] || [];

			items = loadedRawItems.map((itemLoading): DashboardWidgetConfig => {
				const componentInfo = widgetComponentRegistry[itemLoading.component];
				// Ensure that itemLoading conforms to WidgetPreference and add defaults
				// The 'icon' property must exist on WidgetPreference or be handled here.
				// Assuming WidgetPreference from the store might miss some fields, we provide defaults.
				return {
					id: itemLoading.id || crypto.randomUUID(),
					component: itemLoading.component,
					label: itemLoading.label || componentInfo?.name || 'Unknown Widget',
					// IMPORTANT: Ensure WidgetPreference type in your store includes 'icon'.
					// If not, this line will cause a type error or runtime issues.
					icon: itemLoading.icon || componentInfo?.icon || 'mdi:help-circle',
					x: itemLoading.x ?? 0,
					y: itemLoading.y ?? 0,
					w: itemLoading.w || componentInfo?.defaultW || 1,
					h: itemLoading.h || componentInfo?.defaultH || 1,
					min: itemLoading.min || { w: componentInfo?.minW || 1, h: componentInfo?.minH || 1 },
					max: itemLoading.max || { w: cols, h: Infinity },
					movable: itemLoading.movable ?? true,
					resizable: itemLoading.resizable ?? true,
					defaultW: itemLoading.defaultW || componentInfo?.defaultW || 1,
					defaultH: itemLoading.defaultH || componentInfo?.defaultH || 1,
					validSizes: itemLoading.validSizes || componentInfo?.validSizes || []
				} as DashboardWidgetConfig; // Cast to ensure all fields are present
			});

			if (items.length > 0) {
				items = organizeWidgetGrid(items, cols);
			}
		} catch (error) {
			console.error('Failed to load preferences:', error);
			items = [];
		}
		preferencesLoaded = true;
	});

	function organizeWidgetGrid(currentWidgets: DashboardWidgetConfig[], numCols: number): DashboardWidgetConfig[] {
		const gridOccupancy: boolean[][] = [];
		const maxRowsToSearch = 200;
		const organized: DashboardWidgetConfig[] = [];

		for (const widget of currentWidgets) {
			const W = Math.min(numCols, Math.max(widget.min?.w || 1, widget.w));
			const H = Math.max(widget.min?.h || 1, widget.h);
			let placed = false;
			for (let r = 0; r < maxRowsToSearch; r++) {
				if (placed) break;
				for (let c = 0; c <= numCols - W; c++) {
					let canPlace = true;
					for (let dr = 0; dr < H; dr++) {
						for (let dc = 0; dc < W; dc++) {
							if (gridOccupancy[r + dr]?.[c + dc]) {
								canPlace = false;
								break;
							}
						}
						if (!canPlace) break;
					}
					if (canPlace) {
						for (let dr = 0; dr < H; dr++) {
							if (!gridOccupancy[r + dr]) gridOccupancy[r + dr] = [];
							for (let dc = 0; dc < W; dc++) {
								gridOccupancy[r + dr][c + dc] = true;
							}
						}
						organized.push({ ...widget, x: c, y: r, w: W, h: H });
						placed = true;
						break;
					}
				}
			}
			if (!placed) {
				console.warn('Could not place widget:', widget.label);
				organized.push({ ...widget, x: 0, y: maxRowsToSearch, w: W, h: H });
			}
		}
		return organized;
	}

	async function saveLayout() {
		const itemsToSave = organizeWidgetGrid(items, cols);
		items = itemsToSave;
		// Ensure itemsToSave conforms to WidgetPreference[] if that's what setPreference expects
		await systemPreferences.setPreference(pageData.user.id, currentScreenSize, itemsToSave as WidgetPreference[]);
	}

	function handleDndConsider(e: CustomEvent<{ items: DashboardWidgetConfig[]; info: { id: string } }>) {
		draggedItemId = e.detail.info.id;
		items = e.detail.items;
	}

	function handleDndFinalize(e: CustomEvent<{ items: DashboardWidgetConfig[]; info: { id: string } }>) {
		draggedItemId = null;
		items = e.detail.items;
		saveLayout();
	}

	function handleWidgetResized(itemId: string, newSpans: { w: number; h: number }) {
		const itemIndex = items.findIndex((i) => i.id === itemId);
		if (itemIndex === -1) return;

		const item = items[itemIndex];
		const componentInfo = widgetComponentRegistry[item.component];
		let newW = newSpans.w;
		let newH = newSpans.h;

		newW = Math.min(item.max?.w || cols, Math.max(item.min?.w || componentInfo?.minW || 1, newW));
		newH = Math.min(item.max?.h || Infinity, Math.max(item.min?.h || componentInfo?.minH || 1, newH));

		if (componentInfo?.validSizes && componentInfo.validSizes.length > 0) {
			let closestSize = componentInfo.validSizes[0];
			let minDiff = Infinity;
			for (const size of componentInfo.validSizes) {
				const diff = Math.abs(size.w - newW) + Math.abs(size.h - newH);
				if (diff < minDiff) {
					minDiff = diff;
					closestSize = size;
				}
			}
			newW = closestSize.w;
			newH = closestSize.h;
		}
		newW = Math.min(cols, newW);

		items[itemIndex] = { ...item, w: newW, h: newH };
		items = [...items];
		saveLayout();
	}

	function addNewWidget(componentName: string) {
		const componentInfo = widgetComponentRegistry[componentName];
		if (!componentInfo) return;

		const newItem: DashboardWidgetConfig = {
			id: crypto.randomUUID(),
			component: componentName,
			label: componentInfo.name,
			icon: componentInfo.icon, // From registry
			x: 0,
			y: 0,
			w: componentInfo.defaultW,
			h: componentInfo.defaultH,
			min: { w: componentInfo.minW || 1, h: componentInfo.minH || 1 },
			max: { w: cols, h: Infinity },
			movable: true,
			resizable: true,
			defaultW: componentInfo.defaultW,
			defaultH: componentInfo.defaultH,
			validSizes: componentInfo.validSizes || []
		};
		items = [...items, newItem];
		saveLayout();
		dropdownOpen = false;
	}

	function removeWidget(id: string) {
		items = items.filter((item) => item.id !== id);
		saveLayout();
	}

	function resetGrid() {
		items = [];
		// Pass currentScreenSize if clearPreferences is per screen
		systemPreferences.clearPreferences(pageData.user.id /*, currentScreenSize */);
		saveLayout();
	}

	function toggleDropdown() {
		dropdownOpen = !dropdownOpen;
	}

	let currentTheme = $derived($modeCurrent ? 'light' : 'dark');
	let availableWidgets = $derived(Object.keys(widgetComponentRegistry).filter((name) => !items.some((item) => item.component === name)));
	let canAddMoreWidgets = $derived(availableWidgets.length > 0);
</script>

<div class="dashboard-container text-text-900 dark:text-text-100 flex h-screen flex-col bg-surface-50 dark:bg-surface-900">
	<div class="my-2 flex items-center justify-between gap-2 border-b border-surface-200 px-4 py-2 dark:border-surface-700">
		<PageTitle name="Dashboard" icon="bi:bar-chart-line" />
		<div class="flex items-center gap-2">
			{#if canAddMoreWidgets}
				<div class="relative">
					<button
						onclick={toggleDropdown}
						type="button"
						aria-haspopup="true"
						aria-expanded={dropdownOpen}
						class="variant-filled-tertiary btn gap-2 !text-white dark:variant-filled-primary"
					>
						<iconify-icon icon="carbon:add-filled" width="20"></iconify-icon>
						Add Widget
					</button>
					{#if dropdownOpen}
						<div
							class="absolute right-0 z-20 mt-2 w-56 origin-top-right rounded-md border border-gray-300 bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none dark:border-gray-700 dark:bg-gray-800"
							role="menu"
						>
							<div class="py-1" role="none">
								{#each availableWidgets as componentName}
									{@const widgetInfo = widgetComponentRegistry[componentName]}
									<button
										onclick={() => addNewWidget(componentName)}
										type="button"
										class="flex w-full items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-200 dark:hover:bg-gray-700 dark:hover:text-white"
										role="menuitem"
									>
										<iconify-icon icon={widgetInfo.icon} width="18" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
										{widgetInfo.name}
									</button>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			{/if}
			<button class="variant-outline-warning btn" onclick={resetGrid}>Reset Layout</button>
			<button onclick={() => history.back()} aria-label="Back" class="variant-ghost-surface btn-icon">
				<iconify-icon icon="ri:arrow-left-line" width="20"></iconify-icon>
			</button>
		</div>
	</div>

	<div class="relative flex-1 overflow-auto p-4" bind:this={gridElement}>
		{#if !preferencesLoaded}
			<div class="flex h-full items-center justify-center text-lg text-gray-500">Loading preferences...</div>
		{:else if items.length > 0 && gridCellWidth > 0}
			<div
				class="grid h-full flex-1 gap-2 overflow-y-auto py-2"
				style:grid-template-columns="repeat({cols}, 1fr)"
				style:grid-auto-flow="row dense"
				style:grid-auto-rows="{ROW_HEIGHT}px"
				style:gap="{GAP_SIZE}px"
				use:dndzone={{ items: items, ...DND_OPTIONS }}
				onconsider={handleDndConsider}
				onfinalize={handleDndFinalize}
				role="grid"
				aria-label="Dashboard widgets grid"
			>
				{#each items as item (item.id)}
					{@const SvelteComponent = widgetComponentRegistry[item.component]?.component}
					<div
						class:opacity-50={draggedItemId === item.id}
						class:shadow-2xl={draggedItemId === item.id}
						class="relative {item.movable ? 'cursor-grab' : ''}"
						style:grid-column="span {item.w || 1}"
						style:grid-row="span {item.h || 1}"
						role="gridcell"
						animate:flip={{ duration: DND_OPTIONS.flipDurationMs }}
						aria-label={item.label}
						tabindex="0"
						onkeydown={(e) => {
							/* TODO: Keyboard navigation for dnd. Implement logic to move items with arrow keys, perhaps after 'Enter' or 'Space' to select. */
						}}
					>
						{#if SvelteComponent}
							<SvelteComponent
								label={item.label}
								icon={item.icon}
								theme={currentTheme}
								widgetId={item.id}
								{gridCellWidth}
								{ROW_HEIGHT}
								{GAP_SIZE}
								resizable={item.resizable}
								onResizeCommitted={(newSpans: { w: number; h: number }) => handleWidgetResized(item.id, newSpans)}
								onCloseRequest={() => removeWidget(item.id)}
							/>
						{:else}
							<div
								class="flex h-full w-full items-center justify-center rounded-md border border-dashed border-error-500 bg-error-100 p-4 text-error-700"
							>
								Widget "{item.component}" not found.
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{:else if preferencesLoaded && items.length === 0}
			<div class="flex h-full flex-col items-center justify-center text-center">
				<iconify-icon icon="mdi:view-dashboard-outline" width="64" class="mb-4 text-gray-400 dark:text-gray-500"></iconify-icon>
				<p class="text-xl text-gray-500 dark:text-gray-400">Dashboard is Empty</p>
				<p class="text-sm text-gray-400 dark:text-gray-500">Click "Add Widget" to personalize your dashboard.</p>
			</div>
		{/if}
	</div>
</div>
