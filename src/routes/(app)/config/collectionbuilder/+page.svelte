<!--
@file src/routes/(app)/config/collectionbuilder/+page.svelte
@component
**Collection Builder Management Interface**

Main entry point for managing collections and categories with visual organization.
Provides drag-and-drop hierarchical organization and quick create workflows.

### Features
- **Visual Organization**: TreeView with drag-and-drop support
- **Quick Create**: Modal-based creation for categories and collections
- **Batch Operations**: Stage multiple changes before saving
- **Real-time Validation**: Prevent invalid hierarchies and duplicates
- **Undo Support**: Track pending changes before persistence

### Props
- `data.contentStructure` - Array of ContentNode objects representing current hierarchy
- `data.user` - Current authenticated user information
- `data.isAdmin` - Whether user has admin privileges

### State Management
- `currentConfig` - Working copy of content structure
- `nodesToSave` - Pending operations to persist
- `isLoading` - Global loading state for async operations

### Server Actions
- `?/saveConfig` - Persists organizational changes
- `?/deleteCollections` - Deletes collections or categories

### Keyboard Shortcuts
None (TreeView has its own keyboard navigation)

@example
<CollectionBuilder data={{ contentStructure, user, isAdmin }} />
-->
<script lang="ts">
import { SvelteSet } from "svelte/reactivity";
import type { ISODateString } from "@root/src/content/types";
import type { ContentNode, DatabaseId } from "@root/src/databases/db-interface";
import { hasDuplicateSiblingName } from "@src/content";
import {
	button_save,
	collection_add,
	collection_addcategory,
	collection_description,
	collection_pagetitle,
} from "@src/paraglide/messages";
import TreeViewBoard from "@src/routes/(app)/config/collectionbuilder/nested-content/tree-view-board.svelte";
// Stores
import {
	setCollectionValue,
	setContentStructure,
	setMode,
} from "@src/stores/collection-store.svelte";
import { useContent } from "@src/content";
// Native UI Components
import { toast } from "@src/stores/toast.svelte.ts";
import { setRouteContext } from "@src/stores/ui-store.svelte.ts";
import Button from "@components/ui/button.svelte";
import StickyActions from "@components/ui/sticky-actions.svelte";
import AdminPageShell from "@components/admin-page-shell.svelte";
import Slot from "@components/system/slot.svelte";
import AdminCard from "@components/admin-card.svelte";
// Logger
import { logger } from "@utils/logger";
import { modalState } from "@utils/modal.svelte";
import { showConfirm } from "@utils/modal.svelte";
import { afterNavigate, goto, invalidate } from "$app/navigation";
import { registerHotkey } from "@src/utils/hotkeys";
import { onMount } from "svelte";
import { page } from "$app/state";

onMount(() => {
	registerHotkey(
		"mod+s",
		() => {
			if (!isLoading && Object.keys(nodesToSave).length > 0) {
				handleSave();
			}
		},
		"Save collection structure",
	);
});

import ModalCategory from "./nested-content/modal-category.svelte";
import ModalPreset from "./nested-content/modal-preset.svelte";
import ModalQuickStart from "./nested-content/modal-quick-start.svelte";
import EmptyState from "./nested-content/empty-state.svelte";
import { fade } from "svelte/transition";

interface NodeOperation {
	node: ContentNode;
	type: "create" | "update" | "move" | "rename";
}

interface CategoryModalResponse {
	newCategoryIcon: string;
	newCategoryName: string;
}

const { data } = $props();
useContent();

let currentConfig: ContentNode[] = $state([]);
let nodesToSave: Record<string, NodeOperation> = $state({});
let isLoading = $state(false);
/** Single category selected for "add collection" (only one at a time). */
let selectedCategoryId = $state<string | null>(null);
/** When true, next effect run must not overwrite currentConfig with data (we just applied save response). */
let skipNextSyncFromData = false;
/** Allow one sync from data when we land on the page; reset on navigate to avoid effect_update_depth_exceeded. */
let allowSyncFromData = $state(true);
/** Incremented on save success so TreeViewBoard rebuilds from server order. */
let treeVersion = $state(0);

afterNavigate(() => {
	if (
		page.url.pathname.startsWith("/config/collectionbuilder") &&
		!page.url.pathname.includes("/edit")
	) {
		allowSyncFromData = true;
	}
});

import { untrack } from "svelte";

$effect(() => {
	if (
		!allowSyncFromData ||
		!data.contentStructure ||
		Object.keys(nodesToSave).length > 0
	)
		return;
	if (skipNextSyncFromData) {
		skipNextSyncFromData = false;
		return;
	}

	const structure = data.contentStructure as unknown as ContentNode[];

	// Prevent unnecessary state updates if data hasn't actually changed (shallow check)
	const currentHash = JSON.stringify(structure);
	const existingHash = JSON.stringify(currentConfig);
	if (currentHash === existingHash) return;

	allowSyncFromData = false;
	currentConfig = structure;

	// Keep sidebar in sync: it reads from contentStructure store, so update it when we load fresh data from DB
	// Use untrack to ensure this doesn't create a circular dependency if setContentStructure triggers a re-render
	untrack(() => {
		setContentStructure(structure);
	});
});

async function handleNodeUpdate(updatedNodes: ContentNode[]) {
	console.debug("[CollectionBuilder] Hierarchy updated via DnD");
	currentConfig = updatedNodes;

	// Stage all nodes: keep existing 'create' so duplicated collections get their files created on save
	updatedNodes.forEach((node) => {
		const id = node._id.toString();
		const existing = nodesToSave[id];
		const keepCreate = existing?.type === "create";
		nodesToSave[id] = {
			type: keepCreate ? "create" : "move",
			node,
		};
	});
}

/** Collect category id and all descendant node ids from flat list (for category delete). */
function getDescendantIds(categoryId: string, flat: ContentNode[]): string[] {
	const idSet = new SvelteSet<string>();
	const add = (id: string) => {
		if (idSet.has(id)) return;
		idSet.add(id);
		flat
			.filter((n) => n.parentId?.toString() === id)
			.forEach((n) => add(n._id?.toString() ?? ""));
	};
	add(categoryId);
	return Array.from(idSet);
}

async function doDelete(idsToDelete: string[]) {
	try {
		const { deleteContentNodes } = await import("./collectionbuilder.remote");
		const result = await deleteContentNodes(idsToDelete);
		if ("success" in result && result.success) {
			const idSet = new SvelteSet(idsToDelete);
			currentConfig = currentConfig.filter(
				(n) => !idSet.has(n._id?.toString() ?? ""),
			);
			setContentStructure(currentConfig);
			// Invalidate layout so edit/create page sidebar gets fresh structure (no deleted items)
			await invalidate("app:content");
			toast.success(
				idsToDelete.length > 1
					? "Category and attached items deleted"
					: "Item deleted successfully",
			);
		} else {
			const message = (result as any).message ?? "Deletion failed";
			logger.error("Delete failed", message);
			toast.error(message);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : "Deletion failed";
		logger.error("Delete failed", message);
		toast.error(message);
	}
}

function handleDeleteNode(node: Partial<ContentNode>) {
	const nodeId = node._id?.toString();
	if (!nodeId) {
		return;
	}

	const isCategory = node.nodeType === "category";
	if (isCategory) {
		const idsToDelete = getDescendantIds(nodeId, currentConfig);
		const attachedCount = idsToDelete.length - 1; // exclude the category itself
		const body =
			attachedCount > 0
				? `Delete category "${node.name}" and all ${attachedCount} attached collection(s) and sub-categories? This action cannot be undone.`
				: `Delete category "${node.name}"? This action cannot be undone.`;

		showConfirm({
			title: "Delete Category and Contents?",
			body,
			onConfirm: async () => {
				try {
					isLoading = true;
					await doDelete(idsToDelete);
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					logger.error("Delete failed", msg);
					toast.error(msg || "Failed to delete");
				} finally {
					isLoading = false;
				}
			},
		});
	} else {
		showConfirm({
			title: "Delete Item?",
			body: `Are you sure you want to delete "${node.name}"? This action cannot be undone.`,
			onConfirm: async () => {
				try {
					isLoading = true;
					await doDelete([nodeId]);
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					logger.error("Delete failed", msg);
					toast.error(msg || "Failed to delete item");
				} finally {
					isLoading = false;
				}
			},
		});
	}
}

function handleDuplicateNode(node: Partial<ContentNode>) {
	if (!node._id) {
		return;
	}
	const original = currentConfig.find(
		(n) => n._id.toString() === node._id?.toString(),
	);
	if (!original) {
		return;
	}

	const isCategory = original.nodeType === "category";
	if (isCategory) {
		// Duplicate only the category (no attached collections)
		const now = new Date().toISOString() as ISODateString;
		const newId = crypto.randomUUID() as unknown as DatabaseId;
		const baseName = (original.name || "category")
			.toString()
			.replace(/\s+/g, "_");
		const newName = `${baseName}_copy`;
		const rootCount = currentConfig.filter((n) => !n.parentId).length;
		const newNode: ContentNode = {
			...structuredClone(original),
			_id: newId,
			name: newName,
			parentId: undefined,
			path: String(newId),
			order: rootCount,
			updatedAt: now,
			createdAt: now,
		};
		currentConfig = [...currentConfig, newNode];
		nodesToSave[newNode._id?.toString() ?? ""] = {
			type: "create",
			node: newNode,
		};
		toast.success("Category duplicated. Click Save to persist.");
		return;
	}

	// Single collection duplicate — use id-based path so DB and refresh keep stable path (not name-based)
	const newId = crypto.randomUUID() as unknown as DatabaseId;
	const baseName = (
		original.name ||
		(original.collectionDef as { name?: string })?.name ||
		"copy"
	)
		.toString()
		.replace(/\s+/g, "_");
	const newName = `${baseName}_copy`;
	const parentId = original.parentId as DatabaseId | undefined;
	if (hasDuplicateSiblingName(currentConfig, parentId ?? undefined, newName)) {
		toast.warning(
			"A collection with this name already exists at this level. Please choose another name.",
		);
		return;
	}
	const idBasedPath =
		parentId != null ? `${String(parentId)}.${String(newId)}` : String(newId);

	const newNode: ContentNode = structuredClone({
		...original,
		_id: newId,
		name: newName,
		parentId: parentId ?? undefined,
		path: idBasedPath,
		slug: undefined,
		updatedAt: new Date().toISOString() as ISODateString,
		createdAt: new Date().toISOString() as ISODateString,
	});

	if (newNode.collectionDef) {
		(newNode.collectionDef as { name?: string; path?: string }).name = newName;
		(newNode.collectionDef as { name?: string; path?: string }).path =
			newNode.path;
	}

	currentConfig = [...currentConfig, newNode];
	nodesToSave[newId.toString()] = { type: "create", node: newNode };
	toast.success("Item duplicated. Click Save to persist change.");
}

async function handleSave() {
	const items = Object.values(nodesToSave);
	if (items.length === 0) {
		toast.info("No changes to save.");
		return;
	}

	try {
		isLoading = true;

		const { saveContentStructure } = await import("./collectionbuilder.remote");
		const result = await saveContentStructure(items as any);

		if ("success" in result && result.success && result.contentStructure) {
			toast.success("Organization updated successfully");
			currentConfig = result.contentStructure as ContentNode[];
			setContentStructure(currentConfig);
			treeVersion++;
			skipNextSyncFromData = true;
			nodesToSave = {};
			await invalidate("app:content");
		} else {
			const message = (result as any).message ?? "Failed to save";
			logger.error("Error saving categories:", message);
			const isDuplicateName =
				typeof message === "string" &&
				(message.includes("already exists at this level") ||
					message.includes("already exists in the target category"));
			if (isDuplicateName) {
				toast.warning(message);
			} else {
				toast.error(message);
			}
		}
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		logger.error("Error saving categories:", msg);
		toast.error(msg || "Failed to save configuration");
	} finally {
		isLoading = false;
	}
}

function handleSelectCategory(node: { id: string; nodeType: string }): void {
	if (node.nodeType !== "category") return;
	// Toggle: same category clicked again → deselect; otherwise select (only one at a time)
	selectedCategoryId = selectedCategoryId === node.id ? null : node.id;
}

function handleClearCategorySelection(): void {
	selectedCategoryId = null;
}

function handleAddCollectionClick(): void {
	setMode("create");
	const parentId = selectedCategoryId ?? undefined;
	setCollectionValue({
		name: "new",
		icon: "",
		description: "",
		status: "unpublished",
		slug: "",
		fields: [],
		...(parentId && { parentId }),
	});
	const query = parentId ? `?parentId=${encodeURIComponent(parentId)}` : "";
	goto(`/config/collectionbuilder/new${query}`);
}

/** Slugify name for path segment; ensure path is unique among currentConfig. */
function uniquePathForCategory(name: string): string {
	const slug =
		name
			.trim()
			.toLowerCase()
			.replace(/\s+/g, "-")
			.replace(/[^a-z0-9-]/g, "") || "category";
	const existingPaths = new SvelteSet(
		currentConfig.map((n) => (n.path ?? "").toLowerCase()).filter(Boolean),
	);
	let path = `/${slug}`;
	let n = 1;
	while (existingPaths.has(path.toLowerCase())) {
		path = `/${slug}-${n}`;
		n += 1;
	}
	return path;
}

function modalAddCategory(existingCategory: Partial<ContentNode> | undefined = undefined): void {
	modalState.trigger(
		ModalCategory as any,
		{
			existingCategory: existingCategory as ContentNode | undefined,
			title: existingCategory ? "Edit Category" : "Add New Category",
			body: existingCategory
				? "Modify Category Details"
				: "Enter Unique Name and an Icon for your new category",
		},
		async (
			response:
				| CategoryModalResponse
				| boolean
				| { __categoryDeleted: true; contentStructure: ContentNode[] },
		) => {
			if (!response || typeof response === "boolean") {
				return;
			}
			if (
				typeof response === "object" &&
				"__categoryDeleted" in response &&
				response.contentStructure
			) {
				currentConfig = response.contentStructure;
				return;
			}
			const form = response as CategoryModalResponse;
			const nameTrimmed = form.newCategoryName.trim();

			if (existingCategory?._id) {
				if (
					hasDuplicateSiblingName(
						currentConfig,
						existingCategory.parentId ?? undefined,
						nameTrimmed,
						existingCategory._id?.toString(),
					)
				) {
					toast.warning(
						"A category with this name already exists at this level. Please choose another name.",
					);
					return;
				}
				const updated = {
					...existingCategory,
					name: form.newCategoryName,
					icon: form.newCategoryIcon,
					updatedAt: new Date().toISOString() as ISODateString,
				} as ContentNode;
				currentConfig = currentConfig.map((n) =>
					n._id === updated._id ? updated : n,
				);
				nodesToSave[updated._id.toString()] = { type: "rename", node: updated };
			} else {
				if (hasDuplicateSiblingName(currentConfig, undefined, nameTrimmed)) {
					toast.warning(
						"A category with this name already exists at this level. Please choose another name.",
					);
					return;
				}
				const newId = crypto.randomUUID() as unknown as DatabaseId;
				const path = uniquePathForCategory(form.newCategoryName);
				const newCategory: ContentNode = {
					_id: newId,
					name: form.newCategoryName,
					icon: form.newCategoryIcon,
					path,
					order: currentConfig.length,
					translations: [],
					updatedAt: new Date().toISOString() as ISODateString,
					createdAt: new Date().toISOString() as ISODateString,
					parentId: undefined,
					nodeType: "category",
				};
				currentConfig = [...currentConfig, newCategory];
				nodesToSave[newId.toString()] = { type: "create", node: newCategory };
			}
		},
	);
}

function modalLoadPreset(): void {
	modalState.trigger(
		ModalPreset as any,
		{
			title: "Load Starter Preset",
			body: "Select a preset to load into your project. This will copy preset collections and build the project.",
		},
		async (response: { presetId: string } | null) => {
			if (!response || !response.presetId) return;

			try {
				isLoading = true;

				const { installPreset } = await import("./collectionbuilder.remote");
				const result = await installPreset(response.presetId);

				if ("success" in result && result.success) {
					toast.success(`Preset ${response.presetId} loaded successfully`);

					// Force a full page reload to reflect the new collections
					// which are now compiled into the system
					window.location.reload();
				} else {
					const message = (result as any).message || "Failed to load preset";
					toast.error(message);
				}
			} catch (err) {
				logger.error("Error loading preset:", err);
				toast.error(
					err instanceof Error
						? err.message
						: "An error occurred while loading preset",
				);
			} finally {
				isLoading = false;
			}
		},
	);
}

	function modalQuickStart(): void {
		modalState.trigger(
			ModalQuickStart as any,
			{
				title: "Quick-Start Templates",
				body: "Choose a template to instantly create collections.",
			},
			async (response: { installed: boolean; collections?: string[] } | null) => {
				if (!response || !response.installed) return;
				window.location.reload();
			},
		);
	}

	$effect(() => {
		untrack(() => {
			setRouteContext({ isCollectionBuilder: true });
		});
		return () => {
			untrack(() => {
				setRouteContext({ isCollectionBuilder: false });
			});
		};
	});
</script>

{#snippet saveButton(isHeader = false)}
	<Button variant="tertiary"
		onclick={handleSave}
		disabled={isLoading || Object.keys(nodesToSave).length === 0}
		title={Object.keys(nodesToSave).length === 0 ? 'No changes to save' : 'Save changes'}
		aria-keyshortcuts="mod+s"
	 size="sm" class="flex items-center gap-1 {isHeader ? ' sm: ' : ''}">
		{#if isLoading}
			<iconify-icon icon="mdi:loading" width={isHeader ? '18' : '24'} class="animate-spin"></iconify-icon>
		{:else}
			<iconify-icon icon="mdi:content-save" width={isHeader ? '18' : '24'}></iconify-icon>
		{/if}
		<span>{button_save()}</span>
	</Button>
{/snippet}

<AdminPageShell title={collection_pagetitle()} icon="mdi:database-cog-outline" showBackButton={true} backUrl="/config">
	{#snippet actions()}
		<StickyActions>
			{#if currentConfig.length > 0}
				{@render saveButton(false)}
			{/if}
		</StickyActions>
	{/snippet}

	{#if currentConfig.length > 0}
		<AdminCard class="p-6 border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900/40 backdrop-blur-md shadow-xs">
		<div class="mb-4 flex flex-wrap justify-center gap-2" in:fade={{ duration: 300 }}>
		<Button onclick={() => modalQuickStart()} variant="secondary" rounded={true} size="lg" class="group w-52 justify-center" disabled={isLoading}>
			<iconify-icon icon="mdi:magic-staff" width="24" class="transition-transform group-hover:rotate-12"></iconify-icon>
			<span>Quick Start</span>
		</Button>

		<Button
			onclick={() => modalAddCategory()}
			variant="tertiary"
			rounded={true}
			size="lg"
			class="group w-52 justify-center"
			disabled={isLoading}
			data-testid="add-category-button"
		>
			<iconify-icon icon="mdi:folder-plus" width="24" class="transition-transform group-hover:scale-110"></iconify-icon>
			<span>{collection_addcategory()}</span>
		</Button>

		<Button
			href="/config/collectionbuilder/new"
			variant="primary"
			rounded={true}
			size="lg"
			class="group w-52 justify-center"
			data-testid="add-collection-button"
		>
			<iconify-icon icon="ic:round-plus" width="24" class="transition-transform group-hover:rotate-90"></iconify-icon>
			<span>{collection_add()}</span>
		</Button>

		{#if selectedCategoryId}
			<Button
				type="button"
				onclick={handleClearCategorySelection}
				variant="ghost"
				class="flex items-center gap-1 text-surface-700 dark:text-surface-200"
				disabled={isLoading}
				aria-label="Clear category selection"
			>
				<iconify-icon icon="mdi:close-circle-outline" width="24"></iconify-icon>
				<span class="hidden sm:inline">Clear selection</span>
			</Button>
		{/if}
	</div>

	<div class="max-h-[calc(100vh-120px)] overflow-auto p-4" data-testid="collection-builder-board">
		<div class="mx-auto w-full max-w-screen-2xl">
			{#if Object.keys(nodesToSave).length > 0}
				<div
					class="sticky top-0 z-50 mb-4 mt-0 rounded border border-warning-500/30 bg-warning-500/15 px-4 py-3 text-center text-sm font-medium text-warning-600 shadow-sm dark:text-warning-400"
					role="status"
					aria-live="polite"
				>
					You have unsaved organizational changes. Click <strong>Save</strong> to persist.
				</div>
			{/if}
			<p class="mb-6 text-center text-surface-600-300 dark:text-primary-500">{collection_description()}</p>

			<TreeViewBoard
				contentNodes={currentConfig}
				structureKey={treeVersion}
				onNodeUpdate={handleNodeUpdate}
				onEditCategory={modalAddCategory}
				onDeleteNode={handleDeleteNode}
				onDuplicateNode={handleDuplicateNode}
				{selectedCategoryId}
				onSelectCategory={handleSelectCategory}
			/>
		</div>
	</div>
	</AdminCard>
{:else}
	<EmptyState onAddCollection={handleAddCollectionClick} onAddCategory={() => modalAddCategory()} onLoadPreset={modalLoadPreset} onQuickStart={modalQuickStart} />
{/if}

<Slot name="collection_builder" />
</AdminPageShell>
