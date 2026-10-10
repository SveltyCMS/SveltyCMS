<!--
@file src/routes/(app)/config/collectionbuilder/[action]/[...contentPath]/+page.svelte
@component Collection Builder Editor — 3-tab layout (Define / Widgets / Permissions)
 -->
<script lang="ts">
	import AdminPageShell from '@components/admin-page-shell.svelte';
	import { StatusTypes, type FieldInstance, type Schema } from '@src/content/types';
	import type { User } from '@src/databases/auth/types';
	import type { Role } from '@src/databases/auth/types';
	import {
		builder_editor_back,
		builder_editor_canvas,
		builder_editor_delete_aria,
		builder_editor_define_hint,
		builder_editor_finish_hint,
		builder_editor_of_3,
		builder_editor_permissions_hint,
		builder_editor_preview,
		builder_editor_previous_aria,
		builder_editor_ready,
		builder_editor_save_aria,
		builder_editor_split_view,
		builder_editor_step,
		builder_editor_steps_ready,
		builder_editor_typescript,
		builder_editor_view_mode_aria,
		builder_editor_widgets_hint,
		builder_tip_save_need_name,
		builder_tip_save_need_widgets,
		button_delete,
		button_save
	} from '@src/paraglide/messages';
	import { collections, setCollection } from '@src/stores/collection-store.svelte';
	import { ui } from '@src/stores/ui-store.svelte';
	import { useContent } from '@src/content';
	import { validationStore } from '@src/stores/validation-store.svelte';
	import { toast } from '@src/stores/toast.svelte.ts';
	import { widgets } from '@src/stores/widget-store.svelte.ts';
	import { logger } from '@utils/logger';
	import { showConfirm } from '@utils/modal.svelte';
	import { obj2formData } from '@utils/form.svelte';
	import { registerHotkey } from '@src/utils/hotkeys';
	import { onMount, onDestroy, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import CollectionForm from './tabs/collection-form.svelte';
	import CollectionWidget from './tabs/collection-widget.svelte';
	import CollectionPermissions from './tabs/collection-permissions.svelte';
	import { validateMinimumCollectionFields } from '../../collectionbuilder-utils';
	import Tabs from '@src/components/ui/tabs.svelte';
	import Button from '@components/ui/button.svelte';

	const action = $derived(page.params.action);
	const { data } = $props<{ data: { collection?: Schema; user: User; roles?: Role[] } }>();
	useContent();

	let originalName = $state('');
	let isLoading = $state(false);
	let lastCollectionSyncKey = $state<string | null>(null);

	function createDraftCollection(contentPath: string | undefined = undefined): Schema {
		const urlName = contentPath ? contentPath.split('/').filter(Boolean).pop() : '';
		const defaultName = urlName && urlName !== 'new' ? urlName : '';

		return {
			name: defaultName,
			icon: 'bi:collection',
			status: StatusTypes.unpublish,
			fields: [],
			slug:
				defaultName !== 'new'
					? defaultName
							.toLowerCase()
							.replace(/\s+/g, '-')
							.replace(/[^a-z0-9-]/g, '')
					: ''
		} as Schema;
	}

	const editorSyncKey = $derived(
		action === 'edit'
			? `edit:${String(data.collection?._id ?? data.collection?.path ?? page.params.contentPath ?? '')}`
			: `new:${String(page.params.contentPath ?? '')}`
	);

	// Synchronous initial setup so child components mount with a valid collection store.
	// `untrack` is deliberate: this is a one-time mount seed, not a reactive derivation —
	// later `action`/`data` changes are handled by the sync effects further down.
	untrack(() => {
		if (action === 'edit' && data.collection) {
			setCollection(data.collection);
			originalName = String(data.collection.name || '');
		} else if (action === 'new') {
			if (!collections.active || !collections.active.name) {
				const draftCollection = createDraftCollection(page.params.contentPath);
				setCollection(draftCollection);
			}
			originalName = collections.active?.name ? String(collections.active.name) : '';
		}
		lastCollectionSyncKey = editorSyncKey;
	});

	// ── Tab / wizard progress ──
	let activeTab = $state('define');
	let viewMode = $state<'canvas' | 'split' | 'code' | 'preview'>('canvas');

	const TAB_ORDER = ['define', 'widgets', 'permissions'] as const;

	/** Step completion for create/edit wizard UX */
	const stepProgress = $derived.by(() => {
		const c = collections.active;
		const nameOk = !!(c?.name && c.name.trim() && c.name.trim() !== 'new');
		const iconOk = !!(c?.icon && String(c.icon).trim());
		const fields = (c?.fields as FieldInstance[] | undefined) ?? [];
		const widgetsOk = fields.length > 0;
		const defineOk = nameOk && iconOk;
		const meta = [
			{
				id: 'define',
				label: 'Define',
				icon: 'mdi:information',
				done: defineOk,
				description: !nameOk ? 'Name required' : !iconOk ? 'Pick an icon' : 'Ready'
			},
			{
				id: 'widgets',
				label: 'Widgets',
				icon: 'mdi:widgets',
				done: widgetsOk,
				description: widgetsOk
					? `${fields.length} field${fields.length === 1 ? '' : 's'}`
					: 'Add at least one field'
			},
			{
				id: 'permissions',
				label: 'Permissions',
				icon: 'mdi:shield-lock',
				done: true,
				description: 'Optional'
			}
		] as const;
		const completedCount = meta.filter((s) => s.done).length;
		const allRequiredDone = defineOk && widgetsOk;
		return {
			steps: meta,
			completedCount,
			total: meta.length,
			defineOk,
			widgetsOk,
			allRequiredDone
		};
	});

	const editorTabs = $derived(
		stepProgress.steps.map((s) => ({
			id: s.id,
			label: s.label,
			icon: s.icon,
			done: s.done
		}))
	);

	const canGoNext = $derived.by(() => {
		if (activeTab === 'define') return stepProgress.defineOk;
		if (activeTab === 'widgets') return true;
		return false;
	});

	function goToTab(tabId: string) {
		activeTab = tabId;
	}

	function goNext() {
		const idx = TAB_ORDER.indexOf(activeTab as (typeof TAB_ORDER)[number]);
		if (activeTab === 'define' && !stepProgress.defineOk) {
			toast.error('Complete name and icon before continuing');
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
		widgets.initialize();
		ui.setRouteContext({ isCollectionBuilder: true });

		// Hide global header but SHOW layout footer (v4 Studio integration)
		ui.toggle('pageheader', 'hidden');
		ui.toggle('pagefooter', 'full');

		// Centralized Hotkeys
		registerHotkey('mod+s', () => handleCollectionSave(), {
			description: 'Save Collection',
			enableInInputs: true
		});
		registerHotkey('mod+1', () => goToTab('define'), {
			description: 'Switch to Define Tab',
			enableInInputs: true
		});
		registerHotkey('mod+2', () => goToTab('widgets'), {
			description: 'Switch to Widgets Tab',
			enableInInputs: true
		});
		registerHotkey('mod+3', () => goToTab('permissions'), {
			description: 'Switch to Permissions Tab',
			enableInInputs: true
		});
		registerHotkey(
			'mod+k',
			(e) => {
				e.preventDefault();
				if (activeTab !== 'widgets') goToTab('widgets');
				setTimeout(() => {
					const el = document.querySelector(
						'[data-testid="quick-add-field-input"]'
					) as HTMLInputElement | null;
					el?.focus();
				}, 50);
			},
			{ description: 'Quick-Add or Search Widgets', enableInInputs: false }
		);
		registerHotkey(
			'escape',
			// slop:suppress — keyboard Escape shortcut (no anchor target to preload)
			() => goto('/config/collectionbuilder'),
			{ description: 'Cancel & Exit', enableInInputs: false }
		);
	});

	onDestroy(() => {
		ui.setRouteContext({ isCollectionBuilder: false });
		// Restore global UI when leaving builder
		ui.toggle('pageheader', 'full');
		ui.toggle('pagefooter', 'hidden');
	});

	async function handleCollectionSave(confirmDeletions = false) {
		// Clear stale validation errors so the save can proceed after
		// the user has corrected field values (e.g. name validation from
		// a previous attempt that was dismissed without a page reload).
		validationStore.clearAllErrors();

		// Validate required name client-side
		const name = collections.active?.name?.trim() ?? '';
		if (!name || name === 'new') {
			validationStore.setError('name', 'Collection name is required');
			toast.error('Collection name is required');
			return;
		}

		// Minimum-viable guard (the server re-checks): Ctrl+S bypasses the disabled
		// Save button, and a field-less or half-formed schema only compiles into a
		// draft stub that provisions no columns.
		const fieldCheck = validateMinimumCollectionFields(collections.active?.fields ?? []);
		if (!fieldCheck.ok) {
			toast.error(fieldCheck.message);
			return;
		}

		// Duplicate db_fieldName collision guard
		const fieldList = (collections.active?.fields as FieldInstance[] | undefined) ?? [];
		const dbNames = fieldList
			.map((f) => (f.db_fieldName || '').trim().toLowerCase())
			.filter(Boolean);
		const duplicates = dbNames.filter((name, idx) => dbNames.indexOf(name) !== idx);
		if (duplicates.length > 0) {
			const dupList = Array.from(new Set(duplicates)).join(', ');
			toast.error(
				`Duplicate database field name: "${dupList}". Each field must have a unique identifier.`
			);
			return;
		}

		try {
			isLoading = true;
			// Ensure fields always serializes as JSON array for the server action
			const payload = {
				originalName,
				...collections.active,
				name,
				fields: collections.active?.fields ?? [],
				icon: collections.active?.icon || 'bi:collection',
				slug:
					collections.active?.slug ||
					name
						.toLowerCase()
						.replace(/\s+/g, '-')
						.replace(/[^a-z0-9-]/g, '')
			};
			if (confirmDeletions) (payload as any).confirmDeletions = 'true';

			const response = await fetch('?/saveCollection', {
				method: 'POST',
				body: obj2formData(payload as Record<string, unknown>)
			});

			const result = await response.json().catch(() => ({}) as any);
			// SvelteKit action wrappers: prefer nested data.status when present
			const status =
				typeof result?.data?.status === 'number'
					? result.data.status
					: typeof result?.status === 'number'
						? result.status
						: response.ok
							? 200
							: response.status;
			const actionError =
				result?.data?.error || result?.error || result?.data?.message || result?.message;

			if (status === 202 || result?.data?.driftDetected || result?.driftDetected) {
				toast.warning('Schema drift detected — confirm deletions and save again');
				return;
			}

			if (!response.ok || (status >= 400 && status !== 202)) {
				const msg =
					typeof actionError === 'string' && actionError
						? actionError
						: 'Failed to save collection';
				logger.error('Save failed', msg);
				toast.error(msg);
				return;
			}

			toast.success('Collection Saved Successfully');
			// Client-side route update only (preserves SPA shell / soft-refresh contracts)
			if (originalName !== name) {
				originalName = name;
				await goto(`/config/collectionbuilder/edit/${encodeURIComponent(name)}`, {
					refreshAll: false,
					reset: false
				});
			}
		} catch (error) {
			logger.error('Save failed', error);
			toast.error('Failed to save collection');
		} finally {
			isLoading = false;
		}
	}

	function handleCollectionDelete() {
		showConfirm({
			title: 'Delete Collection?',
			body: `Are you sure you want to delete "${collections.active?.name}"?`,
			onConfirm: async () => {
				const res = await fetch('?/deleteCollections', {
					method: 'POST',
					body: obj2formData({ name: collections.active?.name ?? '' })
				});
				const result = await res.json().catch(() => ({}) as { type?: string });
				if (res.ok && result?.type !== 'failure') {
					toast.success('Collection Deleted');
					goto('/config/collectionbuilder');
				} else {
					const msg =
						(result as { data?: { error?: string }; error?: string })?.data?.error ||
						(result as { error?: string }).error ||
						'Failed to delete collection';
					toast.error(msg);
				}
			}
		});
	}

	// Effect: Synchronize URL params with Collection Store
	$effect(() => {
		const syncKey = editorSyncKey;
		const currentAction = page.params.action;

		if (syncKey === lastCollectionSyncKey) return;

		if (currentAction === 'edit' && data.collection) {
			setCollection(data.collection);
			originalName = String(data.collection.name || '');
		} else if (currentAction === 'new') {
			const draftCollection = createDraftCollection(page.params.contentPath);
			setCollection(draftCollection);
			originalName = '';
		}

		lastCollectionSyncKey = syncKey;
	});
</script>

<AdminPageShell
	title={action === 'edit'
		? `Edit ${collections.active?.name}`
		: collections.active?.name && collections.active.name !== 'new'
			? `Create ${collections.active.name}`
			: 'Create Collection'}
	icon={collections.active?.icon || 'ic:baseline-build'}
	showBackButton={true}
	backUrl="/config/collectionbuilder"
	fullHeight={true}
	spaceY="4"
	animate={false}
>
	{#snippet subtitle()}
		<div class="flex flex-wrap items-center gap-2 text-xs">
			<span class="font-semibold text-surface-600 dark:text-surface-400">
				{builder_editor_step()}
				{activeTab === 'define' ? '1' : activeTab === 'widgets' ? '2' : '3'}{' '}
				{builder_editor_of_3()}
				{activeTab === 'define'
					? 'Collection Definition'
					: activeTab === 'widgets'
						? 'Field Schema'
						: 'Permissions'}
			</span>
			<span class="text-surface-300 dark:text-surface-600">•</span>
			<span
				class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-tertiary-500/10 text-tertiary-500 dark:bg-primary-900/20 dark:text-primary-400"
			>
				{stepProgress.completedCount}/{stepProgress.total}
				{builder_editor_steps_ready()}
			</span>
			<span class="text-surface-300 dark:text-surface-600">•</span>
			{#if !stepProgress.allRequiredDone}
				<span class="text-warning-500 dark:text-warning-400 font-medium flex items-center gap-1">
					<iconify-icon icon="mdi:information" width="14"></iconify-icon>
					{builder_editor_finish_hint()}
				</span>
			{:else}
				<span class="text-success-500 dark:text-success-400 font-medium flex items-center gap-1">
					<iconify-icon icon="mdi:check-circle" width="14"></iconify-icon>
					{builder_editor_ready()}
				</span>
			{/if}
		</div>
	{/snippet}
	{#snippet actions()}
		<div class="flex flex-wrap items-center gap-2">
			{#if action === 'edit'}
				<Button
					variant="error"
					onclick={handleCollectionDelete}
					disabled={isLoading}
					aria-label={builder_editor_delete_aria()}
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
					aria-label={builder_editor_previous_aria()}
					data-testid="collection-step-back"
					class="flex items-center gap-1"
				>
					<iconify-icon icon="mdi:arrow-left" width="18"></iconify-icon>
					<span class="hidden sm:inline">{builder_editor_back()}</span>
				</Button>
			{/if}

			{#if activeTab !== 'permissions'}
				<Button
					variant="tertiary"
					onclick={goNext}
					disabled={activeTab === 'define' && !canGoNext}
					aria-label={activeTab === 'define' ? 'Continue to Widgets' : 'Next step'}
					data-testid={activeTab === 'define' ? 'collection-define-next' : 'collection-step-next'}
					class="flex items-center gap-1.5 dark:bg-primary-500 dark:text-white"
				>
					<span>{activeTab === 'define' ? 'Continue to Widgets' : 'Next'}</span>
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
				disabled={isLoading || !stepProgress.allRequiredDone}
				aria-label={builder_editor_save_aria()}
				data-testid="save-collection-button"
				class="flex min-w-25 items-center gap-1 dark:bg-primary-500 dark:text-white"
				title={!stepProgress.defineOk
					? builder_tip_save_need_name()
					: !stepProgress.widgetsOk
						? builder_tip_save_need_widgets()
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

	<!-- Tab Navigation -->
	<div
		class="z-20 shrink-0 border-b border-surface-500/30 bg-white px-4 pt-2 pb-2 dark:border-surface-500/40 dark:bg-surface-900 shadow-xs"
		data-testid="collection-editor-tabs"
	>
		<div class="flex items-center justify-between gap-4">
			<Tabs
				tabs={editorTabs}
				bind:activeTab
				onTabChange={(tabId: string) => goToTab(tabId)}
				variant="underline"
			/>
			<div class="flex items-center gap-3 shrink-0">
				{#if activeTab === 'widgets'}
					<div
						class="hidden sm:flex items-center gap-1.5 text-sm font-semibold text-surface-600 dark:text-surface-400 me-2 border-e border-surface-500/30 pe-3 dark:border-surface-500/40"
					>
						<iconify-icon
							icon="mdi:widgets"
							width="18"
							class="text-tertiary-500 dark:text-primary-500"
						></iconify-icon>
						<span
							>{collections.active?.fields?.length || 0}
							{collections.active?.fields?.length === 1 ? 'Widget' : 'Widgets'}</span
						>
					</div>
					<!-- View Mode Switcher -->
					<div
						class="flex items-center rounded-lg border border-surface-500/30 bg-surface-500/10 p-0.5 dark:border-surface-500/40 dark:bg-surface-500/10"
						role="group"
						aria-label={builder_editor_view_mode_aria()}
					>
						<button
							type="button"
							class="px-2.5 py-1 text-xs font-medium rounded transition-colors {viewMode ===
							'canvas'
								? 'bg-(--admin-bg-card,var(--color-surface-50)) dark:bg-surface-800 shadow-xs text-tertiary-500 dark:text-primary-400 font-bold'
								: 'text-surface-600 hover:text-surface-900 dark:text-surface-400 dark:hover:text-surface-100'}"
							onclick={() => (viewMode = 'canvas')}
							data-testid="view-mode-canvas"
						>
							{builder_editor_canvas()}
						</button>
						<button
							type="button"
							class="px-2.5 py-1 text-xs font-medium rounded transition-colors {viewMode === 'split'
								? 'bg-(--admin-bg-card,var(--color-surface-50)) dark:bg-surface-800 shadow-xs text-tertiary-500 dark:text-primary-400 font-bold'
								: 'text-surface-600 hover:text-surface-900 dark:text-surface-400 dark:hover:text-surface-100'}"
							onclick={() => (viewMode = 'split')}
							data-testid="view-mode-split"
						>
							{builder_editor_split_view()}
						</button>
						<button
							type="button"
							class="px-2.5 py-1 text-xs font-medium rounded transition-colors {viewMode === 'code'
								? 'bg-(--admin-bg-card,var(--color-surface-50)) dark:bg-surface-800 shadow-xs text-tertiary-500 dark:text-primary-400 font-bold'
								: 'text-surface-600 hover:text-surface-900 dark:text-surface-400 dark:hover:text-surface-100'}"
							onclick={() => (viewMode = 'code')}
							data-testid="view-mode-code"
						>
							{builder_editor_typescript()}
						</button>
						<button
							type="button"
							class="px-2.5 py-1 text-xs font-medium rounded transition-colors {viewMode ===
							'preview'
								? 'bg-(--admin-bg-card,var(--color-surface-50)) dark:bg-surface-800 shadow-xs text-tertiary-500 dark:text-primary-400 font-bold'
								: 'text-surface-600 hover:text-surface-900 dark:text-surface-400 dark:hover:text-surface-100'}"
							onclick={() => (viewMode = 'preview')}
							data-testid="view-mode-preview"
						>
							{builder_editor_preview()}
						</button>
					</div>
				{/if}
				<p class="text-surface-500 dark:text-surface-400 hidden lg:block text-xs text-end">
					{#if activeTab === 'define'}
						{builder_editor_define_hint()}
					{:else if activeTab === 'widgets'}
						{builder_editor_widgets_hint()}
					{:else if activeTab === 'permissions'}
						{builder_editor_permissions_hint()}
					{/if}
				</p>
			</div>
		</div>
	</div>

	<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
		<div class="w-full flex-1 overflow-y-auto scroll-smooth">
			<div
				class="h-full min-h-0 {activeTab === 'define'
					? 'w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8'
					: activeTab === 'widgets'
						? 'flex h-full min-h-128 flex-col p-0'
						: 'w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8'}"
			>
				{#if activeTab === 'define'}
					<div
						class="animate-in fade-in duration-200 motion-reduce:animate-none"
						role="tabpanel"
						id="tabpanel-define"
						aria-labelledby="tab-define"
					>
						<CollectionForm bind:data={collections.active} syncKey={editorSyncKey} />
					</div>
				{:else if activeTab === 'widgets'}
					<div
						class="flex h-full min-h-0 flex-1 flex-col animate-in fade-in duration-200 motion-reduce:animate-none"
						role="tabpanel"
						id="tabpanel-widgets"
						aria-labelledby="tab-widgets"
					>
						<CollectionWidget
							fields={(collections.active?.fields as FieldInstance[]) || []}
							roles={data.roles || []}
							bind:viewMode
						/>
					</div>
				{:else if activeTab === 'permissions'}
					<div
						class="animate-in fade-in duration-200 motion-reduce:animate-none"
						role="tabpanel"
						id="tabpanel-permissions"
						aria-labelledby="tab-permissions"
					>
						<CollectionPermissions roles={(data.roles as any) || []} />
					</div>
				{/if}
			</div>
		</div>
	</div>
</AdminPageShell>
