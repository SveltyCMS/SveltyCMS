<!-- 
@file src/routes/(app)/config/collectionbuilder/[action]/[...contentPath]/+page.svelte
@component Collection Builder Editor Shell
 -->
<script lang="ts">
import PageTitle from "@src/components/page-title.svelte";
import type { FieldInstance, Schema } from "@src/content/types";
import type { User } from "@src/databases/auth/types";
import { button_delete, button_save } from "@src/paraglide/messages";
import {
	collections,
	collection,
	setCollection,
} from "@src/stores/collection-store.svelte";
import { ui } from "@src/stores/ui-store.svelte";
import { useContent } from "@src/content";
import { validationStore } from "@src/stores/store.svelte.ts";
import { toast } from "@src/stores/toast.svelte.ts";
import { widgetStoreActions } from "@src/stores/widget-store.svelte.ts";
import { logger } from "@utils/logger";
import { showConfirm } from "@utils/modal-utils";
import { obj2formData } from "@utils/utils";
import { registerHotkey } from "@src/utils/hotkeys";
import { onMount, onDestroy } from "svelte";
import { goto } from "$app/navigation";
import { page } from "$app/state";
import CollectionForm from "./tabs/collection-form.svelte";
import CollectionWidgetOptimized from "./tabs/collection-widget-optimized.svelte";
import Stepper from "@src/components/ui/stepper.svelte";

const action = $derived(page.params.action);
const { data } = $props<{ data: { collection?: Schema; user: User } }>();
useContent();

let originalName = $state("");
let isLoading = $state(false);

// Studio Mode Stepper sync
let activeStep = $derived(collections.stepper.activeStep);
let completedSteps = $derived(collections.stepper.completedSteps);
const steps = $derived(collections.stepper.steps);

// Effect: Synchronize step completion with collection name presence
$effect(() => {
	if (collection.value?.name && collection.value.name !== "new") {
		if (!collections.stepper.completedSteps.has(0)) {
			// Stepper indices are 0-based
			collections.stepper.completedSteps.add(0);
		}
	} else {
		collections.stepper.completedSteps.delete(0);
	}
});

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
	ui.toggle("pagefooter", "hidden"); // Default value from ui-store
});

async function handleCollectionSave(confirmDeletions = false) {
	if (
		validationStore.errors &&
		Object.keys(validationStore.errors).length > 0
	) {
		toast.error("Please fix validation errors before saving");
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

// Effect: Synchronize URL params with Collection Store (Svelte 5 style)
$effect(() => {
	const params = page.params;
	const action = params.action;
	const contentPath = params.contentPath;

	if (action === "edit" && data.collection) {
		setCollection(data.collection);
		originalName = String(data.collection.name || "");
		if (!collections.stepper.completedSteps.has(0)) {
			collections.stepper.completedSteps.add(0);
		}
	} else if (action === "new") {
		// Extract name from contentPath (e.g., /new/testcollection -> testcollection)
		const urlName = contentPath
			? contentPath.split("/").filter(Boolean).pop()
			: "";
		const defaultName = urlName && urlName !== "new" ? urlName : "new";

		// Only update if it's different to avoid loops
		if (collection.value?.name !== defaultName) {
			setCollection({
				name: defaultName,
				icon: "bi:collection",
				status: "unpublished",
				fields: [],
				slug:
					defaultName !== "new"
						? defaultName
								.toLowerCase()
								.replace(/\s+/g, "-")
								.replace(/[^a-z0-9-]/g, "")
						: "",
			} as any);
		}

		originalName = "";
		if (defaultName !== "new" && !collections.stepper.completedSteps.has(0)) {
			collections.stepper.completedSteps.add(0);
		} else if (defaultName === "new") {
			collections.stepper.completedSteps.delete(0);
		}
	}
});
</script>

<div class="flex flex-col h-[calc(100vh-80px)] lg:h-[calc(100vh-64px)] overflow-hidden bg-surface-50 dark:bg-surface-950">
	<!-- Mobile Stepper (Horizontal) -->
	<div class="lg:hidden p-4 border-b border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 shadow-sm z-20">
		<Stepper 
			{steps} 
			currentStep={activeStep - 1} 
			{completedSteps}
			orientation="horizontal"
		/>
	</div>

	<!-- Main Workspace -->
	<main class="flex-1 flex flex-col min-w-0 bg-surface-50 dark:bg-surface-950/50 overflow-hidden relative">
		<!-- Studio Header -->
		<header class="flex items-center justify-between px-2 py-2 sm:px-6 lg:px-10 border-b border-surface-200/60 dark:border-surface-800/60 bg-white/50 dark:bg-surface-900/50 backdrop-blur-md z-10 shrink-0 min-h-[72px]">
				<PageTitle 
					name={action === 'edit' ? `Edit ${collection.value?.name}` : (collection.value?.name && collection.value.name !== 'new' ? `Create ${collection.value.name}` : 'Create Collection')} 
					icon={collection.value?.icon || 'ic:baseline-build'} 
					showBackButton={true} 
					backUrl="/config/collectionbuilder"
				>
					<div class="flex gap-2 ml-auto">
					{#if action === 'edit'}
						<button 
							onclick={handleCollectionDelete} 
							class="preset-filled-error-500 btn flex items-center gap-1" 
							disabled={isLoading}
						>
							<iconify-icon icon="mdi:delete" width="20"></iconify-icon>
							<span class="hidden sm:inline">{button_delete()}</span>
						</button>
					{/if}
					<button 
						onclick={() => handleCollectionSave()} 
						class="preset-filled-primary-500 btn flex items-center gap-1 min-w-[100px]" 
						disabled={isLoading}
					>
						{#if isLoading}
							<iconify-icon icon="mdi:loading" width="20" class="animate-spin"></iconify-icon>
						{:else}
							<iconify-icon icon="mdi:content-save" width="20"></iconify-icon>
						{/if}
						<span>{button_save()}</span>
					</button>
				</div>
			</PageTitle>
		</header>

		<!-- Step Content -->
		<div class="flex-1 overflow-y-auto w-full scroll-smooth">
			<div class="h-full {activeStep === 1 ? 'mx-auto max-w-5xl p-4 sm:p-6 lg:p-10' : 'p-0'}">
				{#if activeStep === 1}
					<div class="animate-in fade-in slide-in-from-bottom-4 duration-500">
						<CollectionForm data={collection.value || {}} handlePageTitleUpdate={(t: string) => collection.value && (collection.value.name = t)} />
					</div>
				{:else if activeStep === 2}
					<div class="h-full animate-in fade-in slide-in-from-right-4 duration-700">
						<CollectionWidgetOptimized fields={(collection.value?.fields as FieldInstance[]) || []} roles={data.roles} />
					</div>
				{/if}
			</div>
		</div>

		<!-- NO INTERNAL FOOTER - Handled by +layout.svelte -->
	</main>
</div>

