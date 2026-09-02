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
- Lazy loading with Intersection Observer — Svelte modules load only when visible
- Picker metadata from server widget.json (no eager glob of every widget)
-->
<script lang="ts">
import WelcomeThemePicker from "@src/components/admin/welcome-theme-picker.svelte";
import AdminCard from "@components/admin-card.svelte";
import AdminPageShell from "@components/admin-page-shell.svelte";
import Slot from "@src/components/system/slot.svelte";
import AdminZone from "@src/components/system/admin-zone.svelte";
import type {
	DashboardWidgetConfig,
	DropIndicator,
	WidgetMeta,
	WidgetSize,
} from "@src/content/types";
import { browser } from "$app/env";
import { onMount, type Component } from "svelte";
import { flip } from "svelte/animate";
import { SvelteMap } from "svelte/reactivity";
import type { Spec } from "json-render-svelte";
import type { PageData } from "./$types";
import type { DashboardWidgetPickerInfo } from "./widget-runtime";

import { systemPreferences } from "@src/stores/dashboard-preferences.svelte.ts";
import { themeStore } from "@src/stores/theme-store.svelte.ts";

import { logger } from "@utils/logger";
import { adminStagger, motionDuration } from "@utils/admin-transitions";
import { clientJsonHeaders } from "@utils/security/client-csrf";
import { generateUUID } from "@utils/native-utils";
import { retryDynamicImport } from "@src/utils/retry-dynamic-import";
	import Button from '@components/ui/button.svelte';
	import Input from '@components/ui/input.svelte';
	import Loader from '@components/ui/loader.svelte';
	import { button_Collections } from '@src/paraglide/messages';
	import { page } from '$app/state';
	import { app } from '@src/stores/store.svelte';

const { data }: { data: PageData } = $props();

interface WidgetRegistryEntry {
	entryFile: string;
	description: string;
	folder: string;
	icon: string;
	license: string;
	name: string;
	widgetMeta: WidgetMeta;
}
type WidgetRegistry = Record<string, WidgetRegistryEntry>;

const MAX_COLUMNS = 4;
const MAX_ROWS = 4;
const HEADER_HEIGHT = 48;

// Lazy chunk map — Vite splits each widget; nothing is fetched until a loader runs.
const widgetLoaders = import.meta.glob("./widgets/*/*.svelte");

function pickerListToRegistry(widgets: DashboardWidgetPickerInfo[]): WidgetRegistry {
	const registry: WidgetRegistry = {};
	for (const widget of widgets) {
		registry[widget.folder] = {
			entryFile: widget.componentName || "index",
			folder: widget.folder,
			name: widget.name,
			description: widget.description || "",
			icon: widget.icon,
			license: widget.license || "free",
			widgetMeta: {
				component: widget.componentName,
				defaultSize: widget.defaultSize || { w: 1, h: 1 },
				description: widget.description,
				icon: widget.icon,
				id: widget.folder,
				label: widget.name,
				name: widget.name,
			},
		};
	}
	return registry;
}

let mainContainerEl: HTMLElement | null = $state(null);
let dropdownOpen = $state(false);
let searchQuery = $state("");
const widgetRegistry = $derived(
	pickerListToRegistry((data.availableWidgets ?? []) as DashboardWidgetPickerInfo[]),
);
const registryLoaded = true;

// --- Hot-collections quick links (behavioral learner) ---
const HOT_COLLECTIONS_CHIP_LIMIT = 8;

interface CollectionNavNode {
	_id: string;
	children?: CollectionNavNode[];
	collectionDef?: { _id?: string; slug?: string };
	name: string;
	nodeType?: string;
	path?: string;
	slug?: string;
}

function flattenCollectionNodes(nodes: CollectionNavNode[] | undefined): CollectionNavNode[] {
	if (!nodes) return [];
	const flat: CollectionNavNode[] = [];
	const walk = (list: CollectionNavNode[]): void => {
		for (const node of list) {
			flat.push(node);
			if (node.children?.length) walk(node.children);
		}
	};
	walk(nodes);
	return flat;
}

function collectionNodeKeys(node: CollectionNavNode): string[] {
	const keys = new Set<string>();
	const add = (value: unknown): void => {
		const s =
			typeof value === 'string' && value ? value.trim().toLowerCase().replace(/^\/+|\/+$/g, '') : '';
		if (s) keys.add(s);
	};
	add(node._id);
	add(node.slug);
	add(node.name);
	add(node.collectionDef?._id);
	add(node.collectionDef?.slug);
	add(node.path);
	return [...keys];
}

// Resolve the hottest collections (slug-like ids recorded by the learner) to
// real collection nodes so chips can carry a label + list URL. Unmappable or
// duplicate ids are skipped; nothing renders when there is no heat signal.
const hotCollectionLinks = $derived.by(() => {
	const hot = data.hotCollections ?? [];
	if (hot.length === 0) return [];
	const contentStructure = (
		page.data as { contentStructure?: CollectionNavNode[] } | undefined
	)?.contentStructure;
	const byKey = new Map<string, CollectionNavNode>();
	for (const node of flattenCollectionNodes(contentStructure)) {
		for (const key of collectionNodeKeys(node)) {
			if (!byKey.has(key)) byKey.set(key, node);
		}
	}
	const chips: { href: string; id: string; label: string }[] = [];
	const seen = new Set<string>();
	const language = app.contentLanguage || 'en';
	for (const { id } of hot) {
		const node = byKey.get(String(id).toLowerCase());
		if (!node) continue;
		const nodeId = String(node._id);
		if (seen.has(nodeId)) continue;
		seen.add(nodeId);
		const listPath =
			node.path && node.path.startsWith('/') ? node.path : `/${node.path || node._id}`;
		chips.push({
			href: `/${language}${listPath}`,
			id: nodeId,
			label: node.name
		});
		if (chips.length >= HOT_COLLECTIONS_CHIP_LIMIT) break;
	}
	return chips;
});

let loadedWidgets = new SvelteMap<string, Component | null>();
const inflightWidgetLoads = new Set<string>();
const widgetObservers = new SvelteMap<string, IntersectionObserver>();

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
	isActive: false,
});
let dropIndicator: DropIndicator | null = $state(null);
let gridDropIndicator: {
	row: number;
	col: number;
	width: number;
	height: number;
} | null = $state(null);

let aiDashboardSpec: Spec | null = $state(null);
let aiLoading = $state(false);
let GenerativeDashboardComp = $state<Component | null>(null);

async function toggleAiMode() {
	if (aiDashboardSpec) {
		aiDashboardSpec = null;
		return;
	}

	aiLoading = true;
	try {
		if (!GenerativeDashboardComp) {
			const mod = await import("./generativedashboard.svelte");
			GenerativeDashboardComp = mod.default;
		}
		const response = await fetch("/api/ai/generate-layout", {
			method: "POST",
			headers: clientJsonHeaders(),
			body: JSON.stringify({
				prompt:
					"Generate a professional system monitoring dashboard with a welcome header and a summary of active users.",
				contextRules:
					"Use VerticalLayout, HorizontalLayout, and Text widgets. Connect to mcp.sveltycms.com for live context if available.",
			}),
		});

		const result = await response.json();
		if (result.spec) {
			aiDashboardSpec = result.spec;
			logger.info("AI Dashboard generated successfully via Knowledge Core.");
		} else {
			throw new Error(result.error || "Failed to generate AI layout");
		}
	} catch (error) {
		logger.error("AI Dashboard Error:", error);
		aiDashboardSpec = {
			root: "layout",
			elements: {
				layout: {
					type: "VerticalLayout",
					elements: ["header", "error"],
				},
				header: {
					type: "Control",
					scope: "#/properties/headerText",
					label: "AI Connection Issue",
					options: {
						widget: "Text",
						content:
							"I could not connect to the live Knowledge Core (mcp.sveltycms.com). Showing offline fallback.",
					},
				},
				error: {
					type: "Control",
					scope: "#/properties/error",
					label: "Status",
					options: {
						widget: "Text",
						content: "Local Ollama or Remote MCP might be unreachable.",
					},
				},
			},
		} as unknown as Spec;
	} finally {
		aiLoading = false;
	}
}

async function loadWidgetComponent(widgetId: string, componentName: string) {
	if (loadedWidgets.has(widgetId) || inflightWidgetLoads.has(widgetId)) {
		return;
	}

	inflightWidgetLoads.add(widgetId);
	try {
		const folder = componentName;
		const entryFile = widgetRegistry[folder]?.entryFile || "index";
		const path = `./widgets/${folder}/${entryFile}.svelte`;
		const loader = widgetLoaders[path];
		if (!loader) {
			logger.error(`Failed to load widget: ${componentName} (no chunk at ${path})`);
			loadedWidgets.set(widgetId, null);
			return;
		}
		const module = (await retryDynamicImport(loader, {
			maxRetries: 2,
			baseDelayMs: 500,
			moduleId: path,
		})) as { default: Component };
		loadedWidgets.set(widgetId, module.default);
	} catch (error) {
		logger.error(`Failed to load widget: ${componentName}`, error);
		loadedWidgets.set(widgetId, null);
	} finally {
		inflightWidgetLoads.delete(widgetId);
	}
}

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
		{ rootMargin: "100px" },
	);

	observer.observe(element);
	widgetObservers.set(widgetId, observer);

	return {
		destroy() {
			observer.disconnect();
			widgetObservers.delete(widgetId);
		},
	};
}

const currentPreferences = $derived(
	systemPreferences.hydratedFromServer
		? systemPreferences.preferences
		: (data.initialPreferences ?? systemPreferences.preferences ?? []),
);
const sortedPreferences = $derived(
	[...currentPreferences].sort(
		(a: DashboardWidgetConfig, b: DashboardWidgetConfig) => (a.order || 0) - (b.order || 0),
	),
);
const installedWidgetFolders = $derived(
	new Set(currentPreferences.map((item: DashboardWidgetConfig) => item.component)),
);
const availableWidgets = $derived(
	Object.keys(widgetRegistry).filter((name) => !installedWidgetFolders.has(name)),
);
const filteredWidgets = $derived(
	availableWidgets.filter((folder) => {
		const query = searchQuery.toLowerCase();
		const info = widgetRegistry[folder];
		return (
			folder.toLowerCase().includes(query) ||
			(info?.name ?? "").toLowerCase().includes(query)
		);
	}),
);

const currentTheme: "dark" | "light" = $derived(
	themeStore.isDarkMode ? "dark" : "light",
);

function findInsertionPosition(x: number, y: number): number {
	const gridContainer = mainContainerEl?.querySelector(
		".responsive-dashboard-grid",
	) as HTMLElement;
	if (!gridContainer) {
		return currentPreferences.length;
	}

	const widgets = Array.from(
		gridContainer.querySelectorAll(".widget-container"),
	) as HTMLElement[];
	const widgetPositions = widgets.map((el) => {
		const rect = el.getBoundingClientRect();
		const gridRect = gridContainer.getBoundingClientRect();
		return {
			id: el.dataset.widgetId,
			centerX: rect.left + rect.width / 2 - gridRect.left,
			centerY: rect.top + rect.height / 2 - gridRect.top,
			rect,
		};
	});

	const relativeX = x - gridContainer.getBoundingClientRect().left;
	const relativeY = y - gridContainer.getBoundingClientRect().top;

	let insertIndex = 0;
	let minDistance = Number.POSITIVE_INFINITY;

	for (let i = 0; i <= widgetPositions.length; i++) {
		let targetY = 0;
		let targetX = 0;

		if (i === 0) {
			targetY = widgetPositions[0]?.centerY || 0;
			targetX = widgetPositions[0]?.centerX || 0;
		} else if (i === widgetPositions.length) {
			const lastWidget = widgetPositions.at(-1);
			targetY = lastWidget?.centerY || relativeY;
			targetX = lastWidget?.centerX || relativeX;
		} else {
			const prevWidget = widgetPositions[i - 1];
			const nextWidget = widgetPositions[i];
			targetY = (prevWidget.centerY + nextWidget.centerY) / 2;
			targetX = (prevWidget.centerX + nextWidget.centerX) / 2;
		}

		const distance = Math.sqrt(
			(relativeX - targetX) ** 2 + (relativeY - targetY) ** 2,
		);

		if (distance < minDistance) {
			minDistance = distance;
			insertIndex = i;
		}
	}

	return insertIndex;
}

function ensureWidgetOrder() {
	const widgets = [...currentPreferences];
	let needsUpdate = false;

	widgets.forEach((widget, index) => {
		if (typeof widget.order !== "number") {
			widget.order = index;
			needsUpdate = true;
		}
	});

	widgets.sort((a, b) => (a.order || 0) - (b.order || 0));
	widgets.forEach((widget, index) => {
		if (widget.order !== index) {
			widget.order = index;
			needsUpdate = true;
		}
	});

	if (needsUpdate) {
		systemPreferences.updateWidgets(widgets);
	}
}

function addNewWidget(componentName: string) {
	const componentInfo = widgetRegistry[componentName];
	if (!componentInfo) {
		logger.error(
			`SveltyCMS: Widget component info for "${componentName}" not found in registry.`,
		);
		return;
	}

	const defaultSize = componentInfo.widgetMeta?.defaultSize || { w: 1, h: 1 };

	const newItem: DashboardWidgetConfig = {
		id: `widget-${generateUUID()}`,
		component: componentName,
		label: componentInfo.name,
		icon: componentInfo.icon,
		size: defaultSize,
		settings: componentInfo.widgetMeta?.settings || {},
		order: currentPreferences.length,
	};
	systemPreferences.updateWidget(newItem);
	void loadWidgetComponent(newItem.id, componentName);
	dropdownOpen = false;
	searchQuery = "";
}

function removeWidget(id: string) {
	systemPreferences.removeWidget(id);
	loadedWidgets.delete(id);
	inflightWidgetLoads.delete(id);
	const observer = widgetObservers.get(id);
	if (observer) {
		observer.disconnect();
		widgetObservers.delete(id);
	}
}

function resetAllWidgets() {
	systemPreferences.setPreferences([]);
	loadedWidgets.clear();
	inflightWidgetLoads.clear();
	widgetObservers.forEach((observer) => observer.disconnect());
	widgetObservers.clear();
}

function resizeWidget(widgetId: string, newSize: WidgetSize) {
	const item = currentPreferences.find(
		(i: DashboardWidgetConfig) => i.id === widgetId,
	);
	if (item) {
		const updatedSize = {
			w: Math.max(1, Math.min(MAX_COLUMNS, newSize.w)),
			h: Math.max(1, Math.min(MAX_ROWS, newSize.h)),
		};
		systemPreferences.updateWidget({ ...item, size: updatedSize });
	}
}

function performDrop(
	widget: DashboardWidgetConfig,
	indicator: { targetIndex: number },
) {
	const currentWidgets = [...currentPreferences];
	const currentIndex = currentWidgets.findIndex((w) => w.id === widget.id);

	if (currentIndex === -1) {
		return;
	}

	const [movedWidget] = currentWidgets.splice(currentIndex, 1);
	currentWidgets.splice(indicator.targetIndex, 0, movedWidget);

	const updatedWidgets = currentWidgets.map((w, index) => ({
		...w,
		order: index,
	}));

	systemPreferences.updateWidgets(updatedWidgets);
}
function handleDragStart(
	event: MouseEvent | TouchEvent | PointerEvent,
	item: DashboardWidgetConfig,
	element: HTMLElement,
) {
	if (
		(event.target as HTMLElement).closest(
			"button, a, input, select, [role=button], .resize-handles, [data-direction]",
		)
	) {
		return;
	}

	const coords = "touches" in event ? event.touches[0] : event;
	const rect = element.getBoundingClientRect();

	if (coords.clientY - rect.top > HEADER_HEIGHT) {
		return;
	}

	event.preventDefault();
	dragState = {
		item,
		element,
		offset: { x: coords.clientX - rect.left, y: coords.clientY - rect.top },
		isActive: true,
	};

	element.style.opacity = "0.5";
	element.style.zIndex = "1000";
	const clone = element.cloneNode(true) as HTMLElement;
	clone.style.cssText = `position: fixed; left: ${rect.left}px; top: ${rect.top}px; width: ${rect.width}px; height: ${rect.height}px; pointer-events: none; transform: scale(1.02); box-shadow: 0 20px 40px rgba(0,0,0,0.15); margin: 0;`;
	document.body.appendChild(clone);
	dragState.element = clone;

	document.addEventListener("pointermove", handleDragMove, { passive: true });
	document.addEventListener("pointerup", handleDragEnd, { once: true });
}

function handleDragMove(event: PointerEvent) {
	if (!(dragState.isActive && dragState.element)) {
		return;
	}

	const coords = event;
	dragState.element.style.left = `${coords.clientX - dragState.offset.x}px`;
	dragState.element.style.top = `${coords.clientY - dragState.offset.y}px`;

	const insertionIndex = findInsertionPosition(coords.clientX, coords.clientY);

	if (dragState.item) {
		const currentIndex = currentPreferences.findIndex(
			(p: DashboardWidgetConfig) => p.id === dragState.item?.id,
		);
		if (
			currentIndex !== -1 &&
			insertionIndex !== currentIndex &&
			insertionIndex !== currentIndex + 1
		) {
			dropIndicator = {
				show: true,
				position: insertionIndex,
				targetIndex:
					insertionIndex > currentIndex ? insertionIndex - 1 : insertionIndex,
			};
		} else {
			dropIndicator = null;
		}
	}

	gridDropIndicator = null;
}

function handleDragEnd() {
	if (!dragState.isActive) {
		return;
	}

	const originalElement = mainContainerEl?.querySelector(
		`[data-widget-id="${dragState.item?.id}"]`,
	) as HTMLElement;
	if (originalElement) {
		originalElement.style.opacity = "";
		originalElement.style.zIndex = "";
	}

	if (dragState.element) {
		document.body.removeChild(dragState.element);
	}

	if (
		dropIndicator &&
		dragState.item &&
		dropIndicator.targetIndex !== undefined
	) {
		performDrop(dragState.item, { targetIndex: dropIndicator.targetIndex });
	}

	dragState = {
		item: null,
		element: null,
		offset: { x: 0, y: 0 },
		isActive: false,
	};
	dropIndicator = null;
	gridDropIndicator = null;

	document.removeEventListener("pointermove", handleDragMove);
}

function handleWidgetKeydown(
	event: KeyboardEvent,
	item: DashboardWidgetConfig,
) {
	const currentWidgets = [...currentPreferences];
	const currentIndex = currentWidgets.findIndex((w) => w.id === item.id);

	if (currentIndex === -1) {
		return;
	}

	let targetIndex = currentIndex;

	if (event.ctrlKey || event.metaKey) {
		if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
			event.preventDefault();
			targetIndex = Math.max(0, currentIndex - 1);
		} else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
			event.preventDefault();
			targetIndex = Math.min(currentWidgets.length - 1, currentIndex + 1);
		}
	}

	if (targetIndex !== currentIndex) {
		const [movedWidget] = currentWidgets.splice(currentIndex, 1);
		currentWidgets.splice(targetIndex, 0, movedWidget);

		const updatedWidgets = currentWidgets.map((w, index) => ({
			...w,
			order: index,
		}));

		systemPreferences.updateWidgets(updatedWidgets);

		setTimeout(() => {
			const el = document.querySelector(
				`[data-widget-id="${item.id}"]`,
			) as HTMLElement;
			el?.focus();
		}, 50);
	}
}

onMount(() => {
	if (browser && Array.isArray(data.initialPreferences)) {
		systemPreferences.hydrate(data.initialPreferences);
	} else if (!systemPreferences.hydratedFromServer) {
		void systemPreferences.loadPreferences();
	}
	ensureWidgetOrder();
	// Optional widgets: import Svelte only when a tile is on the layout (observer / add).

	return () => {
		widgetObservers.forEach((observer) => observer.disconnect());
		widgetObservers.clear();
	};
});
</script>

<div data-testid="dashboard-widget-registry-ready" data-loaded={registryLoaded}>
<AdminPageShell title="Dashboard" icon="bi:bar-chart-line" showBackButton={true} backUrl="/config">
	<WelcomeThemePicker />
	{#snippet actions()}
		<div class="flex items-center gap-2" data-testid="dashboard-toolbar">
			<Button variant="outline"
				onclick={toggleAiMode}
				aria-label="Toggle AI Dashboard Mode"
				title="Toggle AI Dashboard Mode"
				data-testid="dashboard-ai-toggle"
			 class="p-0! min-w-0">
				<iconify-icon icon="mdi:robot-outline" width={20} class={aiDashboardSpec ? 'text-tertiary-500 dark:text-primary-500' : ''}></iconify-icon>
			</Button>
			{#if currentPreferences.length > 0}
				<Button variant="outline" onclick={resetAllWidgets} aria-label="Reset all widgets" title="Reset all widgets" data-testid="dashboard-reset-widgets" class="p-0! min-w-0">
					<iconify-icon icon="mdi:refresh" width={20}></iconify-icon>
				</Button>
			{/if}
			<div class="relative">
				{#if availableWidgets.length > 0}
					<Button variant="tertiary"
						onclick={() => (dropdownOpen = !dropdownOpen)}
						aria-haspopup="true"
						aria-expanded={dropdownOpen}
						aria-label="Add Widget"
						data-testid="dashboard-add-widget"
					 class="dark:">
						<iconify-icon icon="mdi:plus" width={18} class="me-2"></iconify-icon>
						Add Widget
					</Button>
				{/if}
				{#if dropdownOpen}
					<div
						class="widget-dropdown absolute inset-e-0 z-30 mt-2 w-72 rounded border bg-white shadow-2xl dark:border-gray-700 dark:bg-surface-900"
						role="menu"
						data-testid="dashboard-widget-menu"
					>
						<div class="p-2">
							<Input
								type="search"
								bind:value={searchQuery}
								placeholder="Search widgets..."
								aria-label="Search widgets"
								data-testid="dashboard-widget-search"
								class="w-full"
							/>
						</div>
						<div class="max-h-64 overflow-y-auto py-1">
							{#each filteredWidgets as widgetName (widgetName)}
								{@const widgetInfo = widgetRegistry[widgetName]}
								<Button
									variant="ghost"
									class="w-full justify-start gap-2 px-4 py-2 hover:bg-primary-500/10 dark:hover:bg-primary-900/20"
									onclick={() => addNewWidget(widgetName)}
									title={widgetInfo?.description}
									role="menuitem"
								>
									{#if widgetInfo?.icon}
										<iconify-icon icon={widgetInfo.icon} width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
									{:else}
										<iconify-icon icon="mdi:view-dashboard" width={20} class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
									{/if}
									<span class="truncate">{widgetInfo?.name || widgetName}</span>
									{#if widgetInfo?.license && widgetInfo.license !== 'free'}
										<span class="ms-auto text-[10px] font-semibold uppercase tracking-wide text-warning-500">{widgetInfo.license}</span>
									{/if}
								</Button>
							{:else}
								<div class="px-4 py-2 text-sm text-gray-500">No widgets found.</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</div>
	{/snippet}

	<div bind:this={mainContainerEl} class="relative m-0 w-full p-0" style="touch-action: pan-y;" data-testid="dashboard-main">
		<section class="w-full px-1 py-4" data-testid="dashboard-grid-section">
			{#if hotCollectionLinks.length > 0}
				<div class="w-full px-1 pb-1" data-testid="dashboard-hot-collections">
					<span class="text-[10px] font-bold uppercase tracking-wider text-surface-500">{button_Collections()}</span>
					<div class="mt-1.5 flex flex-wrap items-center gap-1.5">
						{#each hotCollectionLinks as link (link.id)}
							<a
								href={link.href}
								data-preload="hover"
								class="inline-flex items-center gap-1.5 rounded-full border border-surface-500/30 bg-surface-500/10 px-3 py-1 text-xs font-semibold text-surface-600 no-underline transition-colors hover:border-tertiary-500/40 hover:text-tertiary-500 focus-visible:ring-2 focus-visible:ring-tertiary-500 dark:border-surface-500/40 dark:text-surface-400 dark:hover:border-primary-500/40 dark:hover:text-primary-500"
							>
								<span class="truncate">{link.label}</span>
							</a>
						{/each}
					</div>
				</div>
			{/if}
			{#if aiLoading}
				<AdminCard class="flex flex-col items-center justify-center border border-surface-500/30 py-20 dark:border-surface-500/40">
					<Loader variant="circle" width="size-16" height="size-16" ariaLabel="Generating AI dashboard" />
					<p class="mt-4 text-lg font-bold text-tertiary-500 dark:text-primary-500">Generating AI Dashboard...</p>
					<p class="text-sm text-surface-500">Connecting to Knowledge Core (mcp.sveltycms.com)</p>
				</AdminCard>
			{:else if aiDashboardSpec && GenerativeDashboardComp}
				<GenerativeDashboardComp spec={aiDashboardSpec} />
			{:else if sortedPreferences.length > 0}
					<div class="responsive-dashboard-grid" role="grid" data-testid="dashboard-widget-grid" aria-label="Dashboard widgets">
						{#if gridDropIndicator}
							<div
								class="pointer-events-none absolute z-30 rounded border-2 border-dashed border-tertiary-500 dark:border-primary-500 bg-tertiary-500 dark:bg-primary-500/20"
								style:grid-column="span {gridDropIndicator.width}"
								style:grid-row="span {gridDropIndicator.height}"
								style:grid-column-start={gridDropIndicator.col + 1}
								style:grid-row-start={gridDropIndicator.row + 1}
							></div>
						{/if}

						{#each sortedPreferences as item, i (item.id)}
							{@const widgetName = item.label || item.component}
							{@const WidgetComponent = loadedWidgets.get(item.id)}
							<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
							<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
							<div
								role="article"
								aria-label="{widgetName} widget. Press Ctrl + Arrow keys to reorder."
								tabindex="0"
								class="widget-container group relative select-none overflow-hidden rounded border border-surface-500/30 bg-surface-500/10 shadow-sm transition-all duration-300 dark:text-surface-50 dark:bg-surface-800 focus:ring-2 focus:ring-primary-500 focus:outline-none"
								data-widget-id={item.id}
								data-widget-order={item.order ?? 0}
								data-testid="dashboard-widget"
								style:grid-column="span {item.size.w}"
								style:grid-row="span {item.size.h}"
								style:touch-action="manipulation"
								style:min-height="{item.size.h * 180}px"
								animate:flip={{ duration: motionDuration(150) }}
								in:adminStagger={{ index: i, rise: 0 }}
								onpointerdown={(event) => handleDragStart(event, item, event.currentTarget)}
								onkeydown={(event) => handleWidgetKeydown(event, item)}
								use:setupWidgetObserver={[item.id, item.component]}
							>
								{#if WidgetComponent === undefined}
									<div class="widget-placeholder h-full p-4">
										<Loader variant="card" height="h-full" ariaLabel="Loading widget" />
									</div>
								{:else if WidgetComponent === null}
									<AdminCard preset="tonal" variant="error" class="flex h-full flex-col items-center justify-center p-4">
										<iconify-icon icon="mdi:alert-circle" width={48} class="mb-2 text-error-500"></iconify-icon>
										<h3 class="h4 mb-2">Widget Load Error</h3>
										<p class="text-sm">Failed to load: {item.component}</p>
										<Button variant="error" onclick={() => removeWidget(item.id)} size="sm" class="mt-4">Remove Widget</Button>
									</AdminCard>
								{:else}
									<WidgetComponent
										config={item}
										label={item.label}
										icon={item.icon}
										widgetId={item.id}
										size={item.size}
										onRemove={() => removeWidget(item.id)}
										onSizeChange={(newSize: WidgetSize) => resizeWidget(item.id, newSize)}
										theme={currentTheme}
										currentUser={data.pageData?.user}
									/>
								{/if}
								{#if dropIndicator}
									{@const currentIndex = sortedPreferences.findIndex((p: DashboardWidgetConfig) => p.id === item.id)}
									{@const isDropTarget = dropIndicator.targetIndex === currentIndex}
									{#if isDropTarget}
										<div class="pointer-events-none absolute inset-x-0 top-0 z-20 h-1 bg-tertiary-500 dark:bg-primary-500" style:transform="translateY(-50%)"></div>
									{/if}
								{/if}
							</div>
						{/each}
					</div>
			{:else}
					<div
						class="mx-auto flex h-[60vh] w-full flex-col items-center justify-center text-center"
						data-testid="dashboard-empty-state"
					>
						<div class="flex flex-col items-center px-10 py-12">
							<iconify-icon icon="mdi:view-dashboard" width={80} class="mb-6 text-tertiary-500 drop-shadow-lg dark:text-primary-500"></iconify-icon>
							<p class="mb-2 text-2xl font-bold text-tertiary-500 dark:text-primary-500">Your Dashboard is Empty</p>
							<p class="mb-6 text-base text-surface-600 dark:text-surface-400">
								Add widgets from the toolbar. Available widgets vary per install (core + plugins).
							</p>
							<Button variant="outline"
								onclick={() => (dropdownOpen = true)}
								aria-label="Add first widget"
								data-testid="dashboard-add-first-widget"
							 class="rounded-full bg-tertiary-500 px-6 py-3 text-lg font-semibold text-white shadow-lg dark:bg-primary-500">
								<iconify-icon icon="mdi:plus" width={22} class="me-2"></iconify-icon>
								Add Widget
							</Button>
						</div>
					</div>
			{/if}

			<section class="w-full px-4 mb-8" data-testid="dashboard-plugin-slot"><Slot name="dashboard" /><AdminZone zone="dashboard" /></section>
		</section>
	</div>
</AdminPageShell>
</div>

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
