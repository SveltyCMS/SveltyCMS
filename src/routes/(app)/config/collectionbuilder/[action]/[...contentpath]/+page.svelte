<!-- 
@files src/routes/(app)/config/collectionbuilder/[action]/[...contentPath]/+page.svelte
@component
**Collection Builder**

### Props
- `data` {Props} - Array of unassigned collection items

### Features
- Collection Builder
-->

<script lang="ts">
	// Paraglide Messages

	import PageTitle from '@src/components/page-title.svelte';
	// Types
	import type { FieldInstance, Schema } from '@src/content/types';
	import { hasDuplicateSiblingName } from '@src/content/utils';
	import type { Role, User } from '@src/databases/auth/types';
	import { button_cancel, button_delete, button_save } from '@src/paraglide/messages';
	import ModalSchemaWarning from '@src/routes/(app)/config/collectionbuilder/modal-schema-warning.svelte';
	// Stores
	import { collection, collections, setCollection } from '@src/stores/collection-store.svelte';
	import { validationStore } from '@src/stores/store.svelte';
	import { toast } from '@src/stores/toast.svelte.ts';
	import { setRouteContext } from '@src/stores/ui-store.svelte.ts';
	import { widgetStoreActions } from '@src/stores/widget-store.svelte.ts';
	// Utils
	import { logger } from '@utils/logger';
	import { showConfirm } from '@utils/modal-utils';
	import { obj2formData } from '@utils/utils';
	import { deserialize } from '$app/forms';
	import { onMount } from 'svelte';
	import { afterNavigate, goto, invalidate, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import CollectionForm from './tabs/collection-form.svelte';
	import CollectionWidgetOptimized from './tabs/collection-widget-optimized.svelte';

	// Reactive: re-evaluates when URL params change during client-side navigation
	const action = $derived(page.params.action);

	interface Props {
		data: {
			collection?: Schema;
			contentLanguage: string;
			/** Flat list for duplicate-name validation (same parentId, case-insensitive name). */
			contentStructure?: Array<{ _id?: string; parentId?: string; name?: string }>;
			roles?: Role[];
			user: User;
		};
	}

	const { data }: Props = $props();
	let originalName = $state('');
	let isLoading = $state(false);
	let migrationPlan = $state<any>(null);
	let showWarningModal = $state(false);
	let justSaved = $state(false);
	let lastLoadedCollectionId = $state<string | null>(null);

	// Sync store from load data only when we switch to a different collection (navigation/load), not on every data update (so status/name edits are not overwritten)
	$effect(() => {
		if (justSaved) return;
		const action = page.params.action;
		const c = data?.collection;
		if (action === 'edit' && c) {
			const id = c._id ?? c.path ?? '';
			const idStr = String(id);
			if (idStr !== lastLoadedCollectionId) {
				lastLoadedCollectionId = idStr;
				setCollection(c);
				const pathStr = c.path != null ? String(c.path).trim() : '';
				originalName = pathStr ? pathStr.replace(/^\//, '') : String(c.name || '');
			}
		} else if (action === 'new') {
			lastLoadedCollectionId = null;
		}
	});

	// Use afterNavigate to update collection state after SPA navigation completes.
	// Skip re-init when we just saved so we don't overwrite the store with stale load data.
	function initializeCollectionFromData() {
		if (justSaved) {
			justSaved = false;
			return;
		}
		const currentAction = page.params.action;
		const currentCollection = data.collection;

		console.log('currentCollection', JSON.stringify(currentCollection));

		if (currentAction === 'edit' && currentCollection) {
			setCollection(currentCollection);
			const pathStr = currentCollection.path != null ? String(currentCollection.path).trim() : '';
			originalName = pathStr ? pathStr.replace(/^\//, '') : String(currentCollection.name || '');
		} else if (currentAction === 'new') {
			const parentId = page.url.searchParams.get('parentId') ?? undefined;
			setCollection({
				name: 'new',
				icon: 'bi:collection',
				status: 'unpublished',
				slug: '',
				fields: [],
				...(parentId && { parentId })
			} as any);
			originalName = '';
		}
	}

	afterNavigate(() => {
		initializeCollectionFromData();
	});

	onMount(() => {
		widgetStoreActions.initializeWidgets();
		// Also initialize on mount for the initial page load
		initializeCollectionFromData();

		// Set route context after mount to avoid "updated at / await in start" (Svelte 5:
		// updating another store's $state inside $effect during component start can trigger this)
		setRouteContext({ isCollectionBuilder: true });

		// Keyboard Shortcuts
		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === 's') {
				e.preventDefault();
				handleCollectionSave();
			}
			if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
				e.preventDefault();
				document.getElementById('save-status')?.focus();
			}
		};
		window.addEventListener('keydown', handleKeyDown);
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
			setRouteContext({ isCollectionBuilder: false });
		};
	});

	const collectionValue = $derived(collection.value);

	async function handleCollectionSave(confirmDeletions = false) {
		if (validationStore.errors && Object.keys(validationStore.errors).length > 0) {
			toast.error('Please fix validation errors before saving');
			return;
		}

		try {
			// Use current store state (includes deletes, edits, reorder) as the single source of truth.
			// Read directly from store at save time so newly added widgets are never lost (avoids stale derived).
			const currentCollection = collections.active ?? collectionValue ?? data?.collection;
			if (!currentCollection) {
				toast.error('No collection to save');
				return;
			}
			const snapshot = JSON.parse(JSON.stringify(currentCollection)) as typeof currentCollection;
			// Ensure fields are always sent: use store's current fields so new widgets persist
			const fieldsToSend = Array.isArray(currentCollection.fields) ? currentCollection.fields : (snapshot?.fields ?? []);
			snapshot.fields = fieldsToSend;

			// Frontend duplicate-name validation before submit (same category, case-insensitive)
			const structure = data?.contentStructure ?? [];
			if (structure.length > 0) {
				const nameTrimmed = (snapshot?.name ?? '').trim();
				if (nameTrimmed) {
					const snapshotWithParent = snapshot as { parentId?: string; _id?: string };
					const parentId =
						snapshotWithParent?.parentId != null && snapshotWithParent.parentId !== ''
							? String(snapshotWithParent.parentId)
							: (page.url.searchParams.get('parentId') ?? undefined);
					const excludeId = snapshotWithParent?._id != null ? String(snapshotWithParent._id) : undefined;
					if (hasDuplicateSiblingName(structure, parentId ?? null, nameTrimmed, excludeId)) {
						toast.warning('A collection with this name already exists in this category. Please choose another name.');
						return;
					}
				}
			}

			isLoading = true;
			// Put originalName last so it is never overwritten by snapshot (enables correct rename)
			const contentPath = Array.isArray(page.params.contentpath) ? page.params.contentpath.join('/') : (page.params.contentpath ?? '');
			const payload: any = {
				...snapshot,
				originalName,
				contentPath: contentPath || snapshot.path || '',
				// Explicitly set fields so new widgets are never omitted (formData serialization)
				fields: snapshot.fields
			};

			console.log('payload', JSON.stringify(payload));

			if (confirmDeletions) {
				payload.confirmDeletions = 'true';
			}

			const response = await fetch('?/saveCollection', {
				method: 'POST',
				body: obj2formData(payload)
			});

			const text = await response.text();
			let result: { type?: string; data?: unknown; error?: { message?: string }; status?: number };
			try {
				result = text ? (deserialize(text) as typeof result) : {};
			} catch {
				result = {};
			}
			const responseData =
				(result.type === 'success' || result.type === 'failure') && result.data != null
					? typeof result.data === 'object'
						? (result.data as Record<string, unknown>)
						: {}
					: (result as Record<string, unknown>);

			if (!response.ok) {
				const message = (responseData?.error as string) ?? (result?.error as { message?: string })?.message ?? `Save failed (${response.status})`;
				toast.warning(message);
				return;
			}

			// Duplicate or validation failure: server may return 200 with status 400 in body — show warning only, never success
			const statusNum = responseData?.status as number | undefined;
			if (
				(statusNum === 400 || (result as { status?: number })?.status === 400) &&
				(responseData?.error ?? (result?.error as { message?: string })?.message)
			) {
				toast.warning((responseData?.error ?? (result?.error as { message?: string })?.message) as string);
				return;
			}

			// Check for drift detection from server (status 202) — save blocked until user confirms
			if (responseData?.driftDetected) {
				migrationPlan = responseData.plan;
				showWarningModal = true;
				toast.info('Manual confirmation required for schema changes');
				return;
			}

			// Explicit failure (e.g. 500 or success: false)
			if (responseData?.success === false || (statusNum != null && statusNum >= 400 && responseData?.error)) {
				toast.warning((responseData?.error as string) ?? 'Save failed');
				return;
			}

			// Success: response ok and no error branch hit (General and Field Configuration both)
			const isSuccess = response.ok && (statusNum === 200 || responseData?.success === true || (result.type === 'success' && !responseData?.error));
			if (isSuccess) {
				toast.success('Collection Saved Successfully');
				showWarningModal = false;
				migrationPlan = null;
				if (originalName !== snapshot?.name) {
					originalName = String(snapshot?.name ?? '');
				}
				setCollection(snapshot);
				justSaved = true;
				// Invalidate caches so layout, list, and edit page loads get fresh data (avoids stale fields)
				await invalidate('app:content');
				await invalidate(page.url.pathname);
				await invalidateAll();
				// Redirect to Collection Builder list after successful save (create or edit)
				await goto('/config/collectionbuilder');
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
			body: `Are you sure you want to delete "${collectionValue?.name}"? This cannot be undone.`,
			onConfirm: async () => {
				const response = await fetch('?/deleteCollections', {
					method: 'POST',
					body: obj2formData({ ids: JSON.stringify([collectionValue?._id]) })
				});

				if (response.ok) {
					toast.success('Collection Deleted');
					goto('/config/collectionbuilder');
				} else {
					toast.error('Failed to delete collection');
				}
			}
		});
	}

	let activeTab = $state('general');
</script>

<PageTitle
	name={action === 'edit' ? `Edit ${collectionValue?.name}` : 'Create Collection'}
	icon={collectionValue?.icon || 'ic:baseline-build'}
	showBackButton={true}
	backUrl="/config/collectionbuilder"
>
	<div class="flex gap-2">
		{#if action === 'edit'}
			<button onclick={handleCollectionDelete} class="preset-filled-error-500 btn flex items-center gap-1" disabled={isLoading}>
				<iconify-icon icon="mdi:delete" width="20"></iconify-icon>
				<span class="hidden sm:inline">{button_delete()}</span>
			</button>
		{/if}
		<button onclick={() => goto('/config/collectionbuilder')} class="preset-outlined-surface-500 btn flex items-center gap-1" disabled={isLoading}>
			<iconify-icon icon="mdi:close" width="20"></iconify-icon>
			<span class="hidden sm:inline">{button_cancel()}</span>
		</button>
		<button onclick={() => handleCollectionSave()} class="preset-filled-primary-500 btn flex items-center gap-1 min-w-[100px]" disabled={isLoading}>
			{#if isLoading}
				<iconify-icon icon="mdi:loading" width="20" class="animate-spin"></iconify-icon>
			{:else}
				<iconify-icon icon="mdi:content-save" width="20"></iconify-icon>
			{/if}
			<span>{button_save()}</span>
		</button>
	</div>
</PageTitle>

<div class="flex h-[calc(100vh-120px)] flex-col">
	<!-- Horizontal Tab Navigation -->
	<div class="flex border-b border-surface-200-800 bg-surface-50-950">
		<button
			class="flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2
				{activeTab === 'general'
				? 'border-primary-500 text-primary-500'
				: 'border-transparent text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'}"
			onclick={() => (activeTab = 'general')}
			type="button"
		>
			<iconify-icon icon="mdi:information" width="18"></iconify-icon>
			General Info
		</button>
		<button
			class="flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2
				{activeTab === 'fields'
				? 'border-primary-500 text-primary-500'
				: 'border-transparent text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'}"
			onclick={() => (activeTab = 'fields')}
			type="button"
		>
			<iconify-icon icon="mdi:widgets" width="18"></iconify-icon>
			Field Configuration
		</button>
	</div>

	<!-- Tab content: only one section visible at a time -->
	<div class="flex-1 overflow-y-auto p-4 sm:p-6 scroll-smooth">
		<div class="mx-auto max-w-7xl w-full">
			{#if activeTab === 'general'}
				<!-- General Info: Name, Slug, Status, Icon, Description -->
				<section class="rounded-xl border border-surface-200-800 bg-surface-50-950 p-6 shadow-sm">
					<div class="mb-4 flex items-center gap-2 border-b border-surface-200-800 pb-2">
						<iconify-icon icon="mdi:cog" width="24" class="text-primary-500"></iconify-icon>
						<h2 class="text-xl font-bold">General Configuration</h2>
					</div>
					<CollectionForm
						data={data?.collection ?? collectionValue ?? undefined}
						handlePageTitleUpdate={(t: string) => collectionValue && (collectionValue.name = t)}
					/>
				</section>
			{:else if activeTab === 'fields'}
				<!-- Field Configuration: Field Definitions, Widgets, Drag & Drop builder -->
				<section class="rounded-xl border border-surface-200-800 bg-surface-50-950 p-4 shadow-sm sm:p-6">
					<div class="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-surface-200-800 pb-2">
						<div class="flex items-center gap-2">
							<iconify-icon icon="mdi:widgets" width="24" class="shrink-0 text-primary-500"></iconify-icon>
							<h2 class="text-lg font-bold sm:text-xl">Field Definitions</h2>
						</div>
						<span class="text-xs text-surface-500"> {collectionValue?.fields?.length || 0} fields total </span>
					</div>
					<CollectionWidgetOptimized fields={(collectionValue?.fields as FieldInstance[]) || []} roles={data?.roles ?? []} />
				</section>
			{/if}
		</div>
	</div>
</div>

{#if showWarningModal && migrationPlan}
	<ModalSchemaWarning
		breakingChanges={migrationPlan.changes.map((c: any) => ({
			type: c.type,
			fieldName: c.fieldName,
			message: c.message,
			suggestion: c.suggestion,
			dataLoss: c.severity === 'critical'
		}))}
		collectionName={collectionValue?.name || ''}
		onConfirm={() => handleCollectionSave(true)}
		onCancel={() => {
			showWarningModal = false;
			migrationPlan = null;
		}}
	/>
{/if}

<style>
	:global(.scroll-smooth) {
		scroll-behavior: smooth;
	}
</style>
