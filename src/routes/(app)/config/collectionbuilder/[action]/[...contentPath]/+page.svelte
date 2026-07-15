<!--
@file src/routes/(app)/config/collectionbuilder/[action]/[...contentPath]/+page.svelte
@component Collection Builder Editor — 3-tab layout (Define / Widgets / Permissions)
 -->
<script lang="ts">
import AdminPageShell from "@components/admin-page-shell.svelte";
import StickyActions from "@components/ui/sticky-actions.svelte";
import { StatusTypes, type FieldInstance, type Schema } from "@src/content/types";
import type { User } from "@src/databases/auth/types";
import type { Role } from "@src/databases/auth/types";
import { button_delete, button_save } from "@src/paraglide/messages";
import {
	collection,
	setCollection,
} from "@src/stores/collection-store.svelte";
import { ui } from "@src/stores/ui-store.svelte";
import { useContent } from "@src/content";
import { validationStore } from "@src/stores/store.svelte.ts";
import { toast } from "@src/stores/toast.svelte.ts";
import { widgetStoreActions } from "@src/stores/widget-store.svelte.ts";
import { logger } from "@utils/logger";
import { showConfirm } from "@utils/modal.svelte";
import { obj2formData } from "@utils/utils";
import { registerHotkey } from "@src/utils/hotkeys";
import { onMount, onDestroy } from "svelte";
import { goto } from "$app/navigation";
import { page } from "$app/state";
import CollectionForm from "./tabs/collection-form.svelte";
import CollectionWidget from "./tabs/collection-widget.svelte";
import CollectionPermissions from "./tabs/collection-permissions.svelte";
import Tabs from "@src/components/ui/tabs.svelte";
import Button from '@components/ui/button.svelte';

const action = $derived(page.params.action);
const { data } = $props<{ data: { collection?: Schema; user: User; roles?: Role[] } }>();
useContent();

let originalName = $state("");
let isLoading = $state(false);
let lastCollectionSyncKey = $state<string | null>(null);

function createDraftCollection(contentPath: string | undefined = undefined): Schema {
	const urlName = contentPath
		? contentPath.split("/").filter(Boolean).pop()
		: "";
	const defaultName = urlName && urlName !== "new" ? urlName : "new";

	return {
		name: defaultName,
		icon: "bi:collection",
		status: StatusTypes.unpublish,
		fields: [],
		slug:
			defaultName !== "new"
				? defaultName
						.toLowerCase()
						.replace(/\s+/g, "-")
						.replace(/[^a-z0-9-]/g, "")
				: "",
	} as Schema;
}

const editorSyncKey = $derived(
	action === "edit"
		? `edit:${String(data.collection?._id ?? data.collection?.path ?? page.params.contentPath ?? "")}`
		: `new:${String(page.params.contentPath ?? "")}`,
);

// ── Tab state ──
let activeTab = $state("define");

const editorTabs = [
	{ id: "define", label: "Define", icon: "mdi:information" },
	{ id: "widgets", label: "Widgets", icon: "mdi:widgets" },
	{ id: "permissions", label: "Permissions", icon: "mdi:shield-lock" },
];

onMount(() => {
	widgetStoreActions.initializeWidgets();
	ui.setRouteContext({ isCollectionBuilder: true });

	// Hide global header but SHOW layout footer (v4 Studio integration)
	ui.toggle("pageheader", "hidden");
	ui.toggle("pagefooter", "full");

	// Centralized Hotkeys
	registerHotkey("mod+s", () => handleCollectionSave(), "Save Collection");
	registerHotkey(
		"escape",
		() => goto("/config/collectionbuilder"),
		"Cancel & Exit",
		false,
	);
});

onDestroy(() => {
	ui.setRouteContext({ isCollectionBuilder: false });
	// Restore global UI when leaving builder
	ui.toggle("pageheader", "full");
	ui.toggle("pagefooter", "hidden");
});

async function handleCollectionSave(confirmDeletions = false) {
	// Clear stale validation errors so the save can proceed after
	// the user has corrected field values (e.g. name validation from
	// a previous attempt that was dismissed without a page reload).
	validationStore.clearAllErrors();

	// Validate required name client-side
	if (!collection.value?.name?.trim()) {
		validationStore.setError("name", "Collection name is required");
		toast.error("Collection name is required");
		return;
	}

	try {
		isLoading = true;
		const payload = { originalName, ...collection.value };
		if (confirmDeletions) (payload as any).confirmDeletions = "true";

		const response = await fetch("?/saveCollection", {
			method: "POST",
			body: obj2formData(payload),
		});

		if (response.ok) {
			toast.success("Collection Saved Successfully");
			if (originalName !== collection.value?.name) {
				originalName = String(collection.value?.name);
				goto(`/config/collectionbuilder/edit/${originalName}`);
			}
		}
	} catch (error) {
		logger.error("Save failed", error);
		toast.error("Failed to save collection");
	} finally {
		isLoading = false;
	}
}

function handleCollectionDelete() {
	showConfirm({
		title: "Delete Collection?",
		body: `Are you sure you want to delete "${collection.value?.name}"?`,
		onConfirm: async () => {
			const res = await fetch("?/deleteCollections", {
				method: "POST",
				body: obj2formData({ ids: JSON.stringify([collection.value?._id]) }),
			});
			if (res.ok) {
				toast.success("Collection Deleted");
				goto("/config/collectionbuilder");
			}
		},
	});
}

// Effect: Synchronize URL params with Collection Store
$effect(() => {
	const syncKey = editorSyncKey;
	const currentAction = page.params.action;

	if (syncKey === lastCollectionSyncKey) return;

	if (currentAction === "edit" && data.collection) {
		setCollection(data.collection);
		originalName = String(data.collection.name || "");
	} else if (currentAction === "new") {
		const draftCollection = createDraftCollection(page.params.contentPath);
		setCollection(draftCollection);
		originalName = "";
	}

	lastCollectionSyncKey = syncKey;
});
</script>

<AdminPageShell
	title={action === 'edit' ? `Edit ${collection.value?.name}` : (collection.value?.name && collection.value.name !== 'new' ? `Create ${collection.value.name}` : 'Create Collection')}
	icon={collection.value?.icon || 'ic:baseline-build'}
	showBackButton={true}
	backUrl="/config/collectionbuilder"
	fullHeight={true}
	spaceY="4"
	animate={false}
>
	{#snippet actions()}
		<div class="flex gap-2">
			{#if action === 'edit'}
				<Button
					variant="error"
					onclick={handleCollectionDelete}
					disabled={isLoading}
					aria-label="Delete collection"
					class="flex items-center gap-1"
				>
					<iconify-icon icon="mdi:delete" width="20"></iconify-icon>
					<span class="hidden sm:inline">{button_delete()}</span>
				</Button>
			{/if}
			<StickyActions>
				<Button
					variant="tertiary"
					onclick={() => handleCollectionSave()}
					disabled={isLoading}
					aria-label="Save collection"
					data-testid="save-collection-button"
					class="dark: flex items-center gap-1 min-w-25"
				>
					{#if isLoading}
						<iconify-icon icon="mdi:loading" width="20" class="animate-spin"></iconify-icon>
					{:else}
						<iconify-icon icon="mdi:content-save" width="20"></iconify-icon>
					{/if}
					<span>{button_save()}</span>
				</Button>
			</StickyActions>
		</div>
	{/snippet}

	<!-- Tab Navigation -->
	<div
		class="px-4 pt-4 border-b border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 shadow-sm z-20 shrink-0"
		data-testid="collection-editor-tabs"
	>
		<Tabs
			tabs={editorTabs}
			activeTab={activeTab}
			onTabChange={(tabId: string) => activeTab = tabId}
			variant="underline"
		/>
	</div>

	<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
		<div class="flex-1 overflow-y-auto w-full scroll-smooth">
			<div class="h-full {activeTab === 'define' ? 'mx-auto max-w-5xl p-4 sm:p-6 lg:p-10' : 'p-0'}">
				{#if activeTab === 'define'}
					<div class="animate-in fade-in slide-in-from-bottom-4 duration-500" role="tabpanel" id="tabpanel-define" aria-labelledby="tab-define">
						<CollectionForm data={collection.value} syncKey={editorSyncKey} />
					</div>
				{:else if activeTab === 'widgets'}
					<div class="h-full animate-in fade-in slide-in-from-right-4 duration-700" role="tabpanel" id="tabpanel-widgets" aria-labelledby="tab-widgets">
						<CollectionWidget fields={(collection.value?.fields as FieldInstance[]) || []} roles={data.roles || []} />
					</div>
				{:else if activeTab === 'permissions'}
					<div class="animate-in fade-in slide-in-from-right-4 duration-700" role="tabpanel" id="tabpanel-permissions" aria-labelledby="tab-permissions">
						<CollectionPermissions roles={data.roles || []} />
					</div>
				{/if}
			</div>
		</div>
	</div>
</AdminPageShell>
