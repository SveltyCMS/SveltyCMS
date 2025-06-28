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

	// Stores
	import { systemPreferences } from '@stores/systemPreferences.svelte';

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

	const GRID_COLS = 4;
	const ROW_HEIGHT = 400; // Double the default height
	const GAP_SIZE = 16;

	interface Props {
		data: { user: { id: string } };
	}
	let { data: pageData }: Props = $props();

	type WidgetSize = '1/4' | '1/2' | '3/4' | 'full';

	type DashboardWidgetConfig = {
		id: string;
		component: string;
		label: string;
		icon: string;
		size: WidgetSize; // Widget size (1/4, 1/2, 3/4, full)
		gridPosition: number; // 0-based position in the grid
	};

	let items: DashboardWidgetConfig[] = $state([]);
	let dropdownOpen = $state(false);
	let preferencesLoaded = $state(false);

	const widgetComponentRegistry: Record<
		string,
		{
			component: any;
			name: string;
			icon: string;
		}
	> = {
		CPUWidget: {
			component: CPUWidget,
			name: 'CPU Usage',
			icon: 'mdi:cpu-64-bit'
		},
		DiskWidget: {
			component: DiskWidget,
			name: 'Disk Usage',
			icon: 'mdi:harddisk'
		},
		MemoryWidget: {
			component: MemoryWidget,
			name: 'Memory Usage',
			icon: 'mdi:memory'
		},
		Last5MediaWidget: {
			component: Last5MediaWidget,
			name: 'Last 5 Media',
			icon: 'mdi:image-multiple'
		},
		UserActivityWidget: {
			component: UserActivityWidget,
			name: 'User Activity',
			icon: 'mdi:account-group'
		},
		SystemMessagesWidget: {
			component: SystemMessagesWidget,
			name: 'System Messages',
			icon: 'mdi:message-alert'
		},
		LogsWidget: {
			component: LogsWidget,
			name: 'System Logs',
			icon: 'mdi:file-document-outline'
		}
	};

	// Helper function to get grid column span based on widget size
	function getColumnSpan(size: WidgetSize): number {
		const span = (() => {
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
		})();
		console.log(`getColumnSpan: size="${size}" -> span=${span}`);
		return span;
	}

	// Helper function to get available sizes for a widget
	function getAvailableSizes(componentName?: string): WidgetSize[] {
		if (componentName === 'LogsWidget') {
			return ['1/2', '3/4', 'full'];
		}
		return ['1/4', '1/2', '3/4', 'full'];
	}

	onMount(async () => {
		try {
			await systemPreferences.loadPreferences(pageData.user.id);
			// Load existing widgets from preferences
			const prefsState = $systemPreferences as any;
			const loadedItems = prefsState?.md || [];

			// Convert existing widgets to new simplified format
			items = loadedItems.map((existingWidget: any, index: number): DashboardWidgetConfig => {
				const componentInfo = widgetComponentRegistry[existingWidget.component];
				// Set default size for LogsWidget
				let defaultSize: WidgetSize = '1/4';
				if (existingWidget.component === 'LogsWidget') {
					defaultSize = '1/2';
				} else {
					if (index === 1) defaultSize = '1/2';
					if (index === 2) defaultSize = '3/4';
					if (index === 3) defaultSize = 'full';
				}

				return {
					id: existingWidget.id || crypto.randomUUID(),
					component: existingWidget.component,
					label: existingWidget.label || componentInfo?.name || 'Unknown Widget',
					icon: existingWidget.icon || componentInfo?.icon || 'mdi:help-circle',
					size: existingWidget.size || defaultSize, // LogsWidget always gets '1/2' if not set
					gridPosition: index
				};
			});
		} catch (error) {
			console.error('Failed to load preferences:', error);
			items = [];
		}
		preferencesLoaded = true;
	});

	async function saveLayout() {
		// Save the current layout to preferences
		await systemPreferences.setPreference(pageData.user.id, 'md', items);
	}

	function addNewWidget(componentName: string) {
		const componentInfo = widgetComponentRegistry[componentName];
		if (!componentInfo) return;

		const newItem: DashboardWidgetConfig = {
			id: crypto.randomUUID(),
			component: componentName,
			label: componentInfo.name,
			icon: componentInfo.icon,
			size: componentName === 'LogsWidget' ? '1/2' : '1/4', // LogsWidget always 1/2
			gridPosition: items.length // Add to the end
		};
		items = [...items, newItem];
		saveLayout();
		dropdownOpen = false;
	}

	// Force reactive updates for grid layout
	let gridUpdateCounter = $state(0);

	function resizeWidget(widgetId: string, newSize: WidgetSize) {
		const itemIndex = items.findIndex((item) => item.id === widgetId);
		if (itemIndex === -1) {
			console.warn(`Widget with id ${widgetId} not found`);
			return;
		}

		const currentWidget = items[itemIndex];
		console.log(`Dashboard: Resizing widget ${widgetId} from ${currentWidget.size} to ${newSize}`);

		const updatedWidget: DashboardWidgetConfig = {
			...currentWidget,
			size: newSize
		};

		const newItems = [...items];
		newItems[itemIndex] = updatedWidget;
		items = newItems;
		gridUpdateCounter++;
		saveLayout();
	}

	function removeWidget(id: string) {
		items = items.filter((item) => item.id !== id);
		// Reorder grid positions
		items = items.map((item, index) => ({ ...item, gridPosition: index }));
		saveLayout();
	}

	function resetGrid() {
		items = [];
		systemPreferences.clearPreferences(pageData.user.id);
		saveLayout();
	}

	function toggleDropdown() {
		dropdownOpen = !dropdownOpen;
	}

	let currentTheme = $derived($modeCurrent ? 'light' : 'dark');
	let availableWidgets = $derived(Object.keys(widgetComponentRegistry).filter((name) => !items.some((item) => item.component === name)));
	let canAddMoreWidgets = $derived(availableWidgets.length > 0);

	let dndItems = $derived(items.map(({ id, size, label, component, icon }) => ({ id, size, label, component, icon })));
</script>

<div
	class="dashboard-container m-0 box-border flex min-h-screen w-full min-w-0 flex-1 flex-col bg-surface-100 p-0 text-neutral-900 dark:bg-surface-900 dark:text-neutral-100"
	style="overflow-y: auto;"
>
	<div class="relative z-20 m-0 flex w-full flex-col p-0">
		<div
			class="relative mt-6 flex w-full items-center justify-between gap-8 rounded-2xl border border-surface-200 bg-gradient-to-br from-white/90 via-surface-50/80 to-primary-50/80 px-2 py-8 shadow-2xl backdrop-blur-2xl dark:border-surface-700 dark:bg-gradient-to-br dark:from-surface-800/90 dark:via-surface-900/80 dark:to-primary-900/80 sm:px-4 md:px-8 lg:px-12"
		>
			<div
				class="absolute left-0 top-0 h-2 w-full animate-pulse rounded-t-xl bg-gradient-to-r from-primary-500 via-emerald-400 to-primary-400 opacity-95 dark:from-primary-600 dark:via-emerald-500 dark:to-primary-400"
				aria-hidden="true"
			></div>
			<div class="flex w-full items-center justify-between gap-8">
				<div class="flex min-w-0 flex-col gap-2">
					<div class="flex items-center gap-4">
						<iconify-icon icon="bi:bar-chart-line" width="40" class="text-primary-500 drop-shadow-lg dark:text-primary-400" aria-hidden="true"
						></iconify-icon>
						<h1
							class="font-display relative text-5xl font-extrabold tracking-tight text-primary-700 drop-shadow-[0_2px_8px_rgba(16,185,129,0.10)] transition-all duration-300 dark:text-primary-200 md:text-6xl md:tracking-tighter"
						>
							<span class="animate-gradient-x bg-gradient-to-r from-primary-400 via-emerald-300 to-primary-500 bg-clip-text text-transparent"
								>Dashboard</span
							>
						</h1>
					</div>
					<p class="font-display text-text-400 dark:text-text-300 ml-14 text-lg font-light tracking-wide opacity-90 md:text-xl">
						Your system overview & quick actions
					</p>
				</div>
				<div class="mx-6 hidden h-20 w-px bg-surface-200 dark:bg-surface-700 md:block" aria-hidden="true"></div>
				<div class="flex items-center gap-4">
					{#if canAddMoreWidgets}
						<div class="relative">
							<button
								onclick={toggleDropdown}
								type="button"
								aria-haspopup="true"
								aria-expanded={dropdownOpen}
								class="btn gap-2 rounded-full bg-primary-500 px-5 py-2.5 text-white shadow-lg transition-all duration-150 hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-400 dark:bg-primary-600 dark:hover:bg-primary-500"
							>
								<iconify-icon icon="carbon:add-filled" width="22" aria-hidden="true"></iconify-icon>
								Add Widget
							</button>
							{#if dropdownOpen}
								<div
									class="absolute right-0 z-30 mt-2 w-64 origin-top-right rounded-2xl border border-surface-200 bg-white shadow-2xl ring-1 ring-black ring-opacity-5 focus:outline-none dark:border-surface-700 dark:bg-surface-800"
									role="menu"
									aria-label="Add widget menu"
								>
									<div class="border-b border-surface-100 px-4 py-3 dark:border-surface-700">
										<p class="font-display mb-1 text-base font-semibold text-primary-700 dark:text-primary-300">Add a Widget</p>
										<p class="text-xs text-surface-500 dark:text-surface-400">Choose a widget to add to your dashboard</p>
									</div>
									<div class="py-2">
										{#each availableWidgets as componentName}
											{@const widgetInfo = widgetComponentRegistry[componentName]}
											<button
												onclick={() => addNewWidget(componentName)}
												type="button"
												class="text-text-700 dark:text-text-200 flex w-full items-center gap-3 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-100 hover:bg-primary-50 hover:text-primary-700 focus:bg-primary-100 focus:text-primary-700 dark:hover:bg-primary-900/30 dark:hover:text-primary-300 dark:focus:bg-primary-900/40 dark:focus:text-primary-200"
												role="menuitem"
												aria-label={widgetInfo.name}
											>
												<iconify-icon icon={widgetInfo.icon} width="20" class="text-tertiary-500 dark:text-primary-400" aria-hidden="true"
												></iconify-icon>
												<span>{widgetInfo.name}</span>
											</button>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					{/if}
					<button
						class="btn flex items-center gap-2 rounded-full bg-warning-500 px-5 py-2.5 font-semibold text-white shadow-lg transition-all duration-150 hover:bg-warning-600 focus:outline-none focus:ring-2 focus:ring-warning-400 dark:bg-warning-600 dark:hover:bg-warning-500"
						onclick={resetGrid}
						aria-label="Reset dashboard layout"
					>
						<iconify-icon icon="mdi:refresh" width="20" class="mr-1" aria-hidden="true"></iconify-icon>
						Reset Layout
					</button>
					<button
						onclick={() => history.back()}
						aria-label="Back"
						class="text-text-400 dark:text-text-300 btn-icon rounded-full border border-surface-200 bg-surface-100 shadow transition-all duration-150 hover:bg-surface-200 hover:text-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400 dark:border-surface-700 dark:bg-surface-800 dark:hover:bg-surface-700 dark:hover:text-primary-400"
					>
						<iconify-icon icon="ri:arrow-left-line" width="22" aria-hidden="true"></iconify-icon>
					</button>
				</div>
			</div>
		</div>
	</div>

	<div class="relative m-0 w-full p-0">
		<div class="w-full px-2 py-4 sm:px-4 md:px-8 lg:px-12">
			{#if !preferencesLoaded}
				<div class="flex h-full items-center justify-center text-lg text-gray-500" role="status" aria-live="polite">Loading preferences...</div>
			{:else if items.length > 0}
				<div
					class="box-border grid w-full max-w-full grid-cols-1 gap-4 overflow-x-auto sm:grid-cols-2 lg:grid-cols-4"
					role="grid"
					aria-label="Dashboard widgets grid"
					data-grid-update={gridUpdateCounter}
				>
					{#each items as item (`${item.id}-${item.size}-${gridUpdateCounter}`)}
						{@const SvelteComponent = widgetComponentRegistry[item.component]?.component}
						{@const columnSpan = getColumnSpan(item.size)}
						{#if SvelteComponent}
							<div
								class={`widget-container col-span-${columnSpan} box-border max-w-full overflow-hidden`}
								data-widget-id={item.id}
								data-widget-size={item.size}
								data-column-span={columnSpan}
								data-grid-update={gridUpdateCounter}
								role="gridcell"
								aria-label={item.label}
								tabindex="0"
							>
								<SvelteComponent
									label={item.label}
									icon={item.icon}
									theme={currentTheme}
									widgetId={item.id}
									currentSize={item.size}
									availableSizes={getAvailableSizes(item.component)}
									onSizeChange={(newSize) => resizeWidget(item.id, newSize)}
									{ROW_HEIGHT}
									{GAP_SIZE}
									onCloseRequest={() => removeWidget(item.id)}
								/>
							</div>
						{:else}
							<div
								class={`flex h-full w-full items-center justify-center rounded-md border border-dashed border-error-500 bg-error-100 p-4 text-error-700 col-span-${columnSpan} box-border max-w-full overflow-hidden`}
								role="gridcell"
								aria-label={item.label}
								tabindex="0"
							>
								Widget "{item.component}" not found.
							</div>
						{/if}
					{/each}
				</div>
			{:else if preferencesLoaded && items.length === 0}
				<div class="mx-auto flex h-[60vh] w-full flex-col items-center justify-center text-center" role="status" aria-live="polite">
					<div class="flex flex-col items-center px-10 py-12">
						<iconify-icon
							icon="mdi:view-dashboard-outline"
							width="80"
							class="mb-6 text-primary-400 drop-shadow-lg dark:text-primary-500"
							aria-hidden="true"
						></iconify-icon>
						<p class="font-display mb-2 text-2xl font-bold text-primary-700 dark:text-primary-200">Your Dashboard is Empty</p>
						<p class="mb-6 text-base text-surface-600 dark:text-surface-300">
							Click below to add your first widget and start personalizing your dashboard experience.
						</p>
						<button
							class="btn rounded-full bg-primary-500 px-6 py-3 text-lg font-semibold text-white shadow-lg transition-all duration-150 hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-400 dark:bg-primary-600 dark:hover:bg-primary-500"
							onclick={() => (dropdownOpen = true)}
							aria-label="Add widget"
						>
							<iconify-icon icon="mdi:plus" width="22" class="mr-2" aria-hidden="true"></iconify-icon>
							Add Widget
						</button>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	/* Gradient animation for title */
	@keyframes gradient-x {
		0%,
		100% {
			background-position: 0% 50%;
		}
		50% {
			background-position: 100% 50%;
		}
	}
	.animate-gradient-x {
		background-size: 200% 200%;
		animation: gradient-x 3s ease-in-out infinite;
	}
</style>
