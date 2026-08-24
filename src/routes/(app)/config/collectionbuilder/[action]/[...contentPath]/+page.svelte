<!--
@file src/routes/(app)/config/collectionbuilder/[action]/[...contentPath]/+page.svelte
@component Collection Builder Editor — 3-tab layout (Define / Widgets / Permissions)
 -->
<script lang="ts">
import AdminPageShell from "@components/admin-page-shell.svelte";
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
import Stepper from "@components/ui/stepper.svelte";
import type { StepperStep } from "@components/ui/stepper.svelte";
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

// ── Tab / wizard progress ──
let activeTab = $state("define");

const editorTabs = [
	{ id: "define", label: "Define", icon: "mdi:information" },
	{ id: "widgets", label: "Widgets", icon: "mdi:widgets" },
	{ id: "permissions", label: "Permissions", icon: "mdi:shield-lock" },
];

const TAB_ORDER = ["define", "widgets", "permissions"] as const;

/** Step completion for create/edit wizard UX */
const stepProgress = $derived.by(() => {
	const c = collection.value;
	const nameOk = !!(c?.name && c.name.trim() && c.name.trim() !== "new");
	const iconOk = !!(c?.icon && String(c.icon).trim());
	const fields = (c?.fields as FieldInstance[] | undefined) ?? [];
	const widgetsOk = fields.length > 0;
	const defineOk = nameOk && iconOk;
	const meta = [
		{
			id: "define",
			label: "Define",
			icon: "mdi:information",
			done: defineOk,
			description: !nameOk
				? "Name required"
				: !iconOk
					? "Pick an icon"
					: "Ready",
		},
		{
			id: "widgets",
			label: "Widgets",
			icon: "mdi:widgets",
			done: widgetsOk,
			description: widgetsOk
				? `${fields.length} field${fields.length === 1 ? "" : "s"}`
				: "Add at least one field",
		},
		{
			id: "permissions",
			label: "Permissions",
			icon: "mdi:shield-lock",
			done: true,
			description: "Optional",
		},
	] as const;
	const completedCount = meta.filter((s) => s.done).length;
	const allRequiredDone = defineOk && widgetsOk;
	const currentIndex = Math.max(
		0,
		TAB_ORDER.indexOf(activeTab as (typeof TAB_ORDER)[number]),
	);
	const stepperSteps: StepperStep[] = meta.map((s) => ({
		id: s.id,
		label: s.label,
		icon: s.icon,
		description: s.description,
	}));
	const completedFlags = meta.map((s) => s.done);
	// Allow free navigation between define / widgets / permissions (edit-friendly)
	const clickable = meta.map(() => true);
	return {
		steps: meta,
		stepperSteps,
		completedFlags,
		clickable,
		currentIndex,
		completedCount,
		total: meta.length,
		defineOk,
		widgetsOk,
		allRequiredDone,
	};
});

const canGoNext = $derived.by(() => {
	if (activeTab === "define") return stepProgress.defineOk;
	if (activeTab === "widgets") return true;
	return false;
});

function goToTab(tabId: string) {
	activeTab = tabId;
}

function goToStepIndex(index: number) {
	const id = TAB_ORDER[index];
	if (id) activeTab = id;
}

function goNext() {
	const idx = TAB_ORDER.indexOf(activeTab as (typeof TAB_ORDER)[number]);
	if (activeTab === "define" && !stepProgress.defineOk) {
		toast.error("Complete name and icon before continuing");
		return;
	}
	if (idx >= 0 && idx < TAB_ORDER.length - 1) {
		activeTab = TAB_ORDER[idx + 1];
	}
}

function goBack() {
	const idx = TAB_ORDER.indexOf(activeTab as (typeof TAB_ORDER)[number]);
	if (idx > 0) activeTab = TAB_ORDER[idx - 1];
}

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
	const name = collection.value?.name?.trim() ?? "";
	if (!name || name === "new") {
		validationStore.setError("name", "Collection name is required");
		toast.error("Collection name is required");
		return;
	}

	try {
		isLoading = true;
		// Ensure fields always serializes as JSON array for the server action
		const payload = {
			originalName,
			...collection.value,
			name,
			fields: collection.value?.fields ?? [],
			icon: collection.value?.icon || "bi:collection",
			slug:
				collection.value?.slug ||
				name
					.toLowerCase()
					.replace(/\s+/g, "-")
					.replace(/[^a-z0-9-]/g, ""),
		};
		if (confirmDeletions) (payload as any).confirmDeletions = "true";

		const response = await fetch("?/saveCollection", {
			method: "POST",
			body: obj2formData(payload as Record<string, unknown>),
		});

		const result = await response.json().catch(() => ({} as any));
		// SvelteKit action wrappers: prefer nested data.status when present
		const status =
			typeof result?.data?.status === "number"
				? result.data.status
				: typeof result?.status === "number"
					? result.status
					: response.ok
						? 200
						: response.status;
		const actionError =
			result?.data?.error || result?.error || result?.data?.message || result?.message;

		if (status === 202 || result?.data?.driftDetected || result?.driftDetected) {
			toast.warning("Schema drift detected — confirm deletions and save again");
			return;
		}

		if (!response.ok || (status >= 400 && status !== 202)) {
			const msg =
				typeof actionError === "string" && actionError
					? actionError
					: "Failed to save collection";
			logger.error("Save failed", msg);
			toast.error(msg);
			return;
		}

		toast.success("Collection Saved Successfully");
		// Client-side route update only (preserves SPA shell / soft-refresh contracts)
		if (originalName !== name) {
			originalName = name;
			await goto(`/config/collectionbuilder/edit/${encodeURIComponent(name)}`, {
				refreshAll: false,
				reset: false,
			});
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
				body: obj2formData({ name: collection.value?.name ?? "" }),
			});
			const result = await res.json().catch(() => ({} as { type?: string }));
			if (res.ok && result?.type !== "failure") {
				toast.success("Collection Deleted");
				goto("/config/collectionbuilder");
			} else {
				const msg =
					(result as { data?: { error?: string }; error?: string })?.data?.error ||
					(result as { error?: string }).error ||
					"Failed to delete collection";
				toast.error(msg);
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
		<div class="flex flex-wrap items-center gap-2">
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

			{#if activeTab !== 'define'}
				<Button
					variant="outline"
					onclick={goBack}
					aria-label="Previous step"
					data-testid="collection-step-back"
					class="flex items-center gap-1"
				>
					<iconify-icon icon="mdi:arrow-left" width="18"></iconify-icon>
					<span class="hidden sm:inline">Back</span>
				</Button>
			{/if}

			{#if activeTab !== 'permissions'}
				<Button
					variant="primary"
					onclick={goNext}
					disabled={activeTab === 'define' && !canGoNext}
					aria-label="Next step"
					data-testid="collection-step-next"
					class="flex items-center gap-1"
				>
					<span>Next</span>
					<iconify-icon icon="mdi:arrow-right" width="18"></iconify-icon>
				</Button>
			{/if}

			<!-- Always expose Save (E2E + power users); disable until name+icon are set.
			     Not wrapped in StickyActions: with the theme sticky action bar enabled the
			     layout renders those actions at the bottom-right where the toast region
			     (fixed, z-9999) overlays them — a lingering toast (never auto-dismissed in
			     TEST_MODE) swallows the click and the save never fires. The header actions
			     row is never covered. -->
			<Button
				variant="tertiary"
				onclick={() => handleCollectionSave()}
				disabled={isLoading || !stepProgress.defineOk}
				aria-label="Save collection"
				data-testid="save-collection-button"
				class="flex min-w-25 items-center gap-1"
				title={!stepProgress.defineOk
					? 'Set collection name and icon first'
					: !stepProgress.widgetsOk
						? 'Tip: add widgets before saving a complete schema'
						: undefined}
			>
				{#if isLoading}
					<iconify-icon icon="mdi:loading" width="20" class="animate-spin"></iconify-icon>
				{:else}
					<iconify-icon icon="mdi:content-save" width="20"></iconify-icon>
				{/if}
				<span>{button_save()}</span>
			</Button>
		</div>
	{/snippet}

	<!-- Wizard progress — shared UI Stepper (same component as Setup) -->
	<div
		class="shrink-0 border-b border-surface-500/30 bg-surface-500/80 px-3 py-3 dark:border-surface-500/40 dark:bg-surface-900/50 sm:px-4"
		data-testid="collection-wizard-progress"
		role="status"
		aria-live="polite"
	>
		<div class="mx-auto flex max-w-5xl flex-col gap-2">
			<Stepper
				steps={stepProgress.stepperSteps}
				currentStep={stepProgress.currentIndex}
				completedSteps={stepProgress.completedFlags}
				stepClickable={stepProgress.clickable}
				orientation="horizontal"
				variant="default"
				compact={false}
				onStepClick={goToStepIndex}
				class="w-full"
			/>
			<p class="text-center text-xs text-surface-500 dark:text-surface-400 sm:text-start">
				{stepProgress.completedCount}/{stepProgress.total} steps ready
				{#if !stepProgress.allRequiredDone}
					<span class="text-warning-600 dark:text-warning-400">
						— finish Define + Widgets to save a complete collection</span
					>
				{/if}
			</p>
		</div>
	</div>

	<!-- Tab Navigation -->
	<div
		class="z-20 shrink-0 border-b border-surface-500/30 bg-white px-4 pt-2 dark:border-surface-500/40 dark:bg-surface-900 shadow-sm"
		data-testid="collection-editor-tabs"
	>
		<Tabs
			tabs={editorTabs}
			activeTab={activeTab}
			onTabChange={(tabId: string) => goToTab(tabId)}
			variant="underline"
		/>
	</div>

	<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
		<div class="w-full flex-1 overflow-y-auto scroll-smooth">
			<div
				class="h-full min-h-0 {activeTab === 'define'
					? 'mx-auto max-w-5xl p-4 sm:p-6 lg:p-10'
					: activeTab === 'widgets'
						? 'flex h-full min-h-128 flex-col p-0'
						: 'mx-auto max-w-5xl p-4 sm:p-6'}"
			>
				{#if activeTab === 'define'}
					<div class="animate-in fade-in slide-in-from-bottom-4 duration-500" role="tabpanel" id="tabpanel-define" aria-labelledby="tab-define">
						<CollectionForm data={collection.value} syncKey={editorSyncKey} />
						<div class="mt-8 flex justify-end gap-2 border-t border-surface-500/30 pt-6 dark:border-surface-500/40">
							<Button
								variant="primary"
								onclick={goNext}
								disabled={!stepProgress.defineOk}
								data-testid="collection-define-next"
								class="flex items-center gap-2"
							>
								Continue to Widgets
								<iconify-icon icon="mdi:arrow-right" width="18"></iconify-icon>
							</Button>
						</div>
					</div>
				{:else if activeTab === 'widgets'}
					<div class="flex h-full min-h-0 flex-1 flex-col animate-in fade-in slide-in-from-right-4 duration-500" role="tabpanel" id="tabpanel-widgets" aria-labelledby="tab-widgets">
						<CollectionWidget fields={(collection.value?.fields as FieldInstance[]) || []} roles={data.roles || []} />
					</div>
				{:else if activeTab === 'permissions'}
					<div class="animate-in fade-in slide-in-from-right-4 duration-500" role="tabpanel" id="tabpanel-permissions" aria-labelledby="tab-permissions">
						<CollectionPermissions roles={data.roles as any || []} />
						<div class="mt-8 flex flex-wrap justify-between gap-2 border-t border-surface-500/30 pt-6 dark:border-surface-500/40">
							<Button variant="outline" onclick={goBack} class="flex items-center gap-1">
								<iconify-icon icon="mdi:arrow-left" width="18"></iconify-icon>
								Back
							</Button>
							{#if stepProgress.allRequiredDone}
								<Button
									variant="tertiary"
									onclick={() => handleCollectionSave()}
									disabled={isLoading}
									data-testid="save-collection-footer"
									class="flex items-center gap-1"
								>
									<iconify-icon icon="mdi:content-save" width="18"></iconify-icon>
									{button_save()}
								</Button>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		</div>
	</div>
</AdminPageShell>
