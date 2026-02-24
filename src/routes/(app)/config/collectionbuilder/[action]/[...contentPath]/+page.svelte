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
	import { button_delete, button_cancel, button_save } from '@src/paraglide/messages';

	import PageTitle from '@src/components/page-title.svelte';
	import CollectionForm from './tabs/collection-form.svelte';
	import CollectionWidgetOptimized from './tabs/collection-widget-optimized.svelte';
	import ModalSchemaWarning from '@src/routes/(app)/config/collectionbuilder/modal-schema-warning.svelte';

	// Types
	import type { FieldInstance, Schema } from '@src/content/types';
	import type { User } from '@src/databases/auth/types';

	// Stores
	import { collection, collections, setCollection } from '@src/stores/collection-store.svelte';
	import { toaster, validationStore } from '@src/stores/store.svelte';
	import { setRouteContext } from '@src/stores/ui-store.svelte.ts';
	import { widgetStoreActions } from '@src/stores/widget-store.svelte.ts';

	// Utils
	import { logger } from '@utils/logger';
	import { showConfirm } from '@utils/modal-utils';
	import { obj2formData } from '@utils/utils';
	import { onMount } from 'svelte';
	import { afterNavigate, goto, invalidate, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';

	// Reactive: re-evaluates when URL params change during client-side navigation
	const action = $derived(page.params.action);

	interface Props {
		data: {
			collection?: Schema;
			contentLanguage: string;
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

		if (currentAction === 'edit' && currentCollection) {
			setCollection(currentCollection);
			const pathStr = currentCollection.path != null ? String(currentCollection.path).trim() : '';
			originalName = pathStr ? pathStr.replace(/^\//, '') : String(currentCollection.name || '');
		} else if (currentAction === 'new') {
			setCollection({
				name: 'new',
				icon: 'bi:collection',
				status: 'unpublished',
				slug: '',
				fields: []
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
			toaster.error({
				description: 'Please fix validation errors before saving'
			});
			return;
		}

		try {
			isLoading = true;
			// Use snapshot from store so Field Inspector edits (label, db_fieldName, required, icon) are included
			const currentCollection = collections.active;
			if (!currentCollection) {
				toaster.error({ description: 'No collection to save' });
				return;
			}
			const snapshot = JSON.parse(JSON.stringify(currentCollection)) as typeof currentCollection;

			// Put originalName last so it is never overwritten by snapshot (enables correct rename)
			const contentPath = Array.isArray(page.params.contentPath) ? page.params.contentPath.join('/') : (page.params.contentPath ?? '');
			const payload: any = {
				...snapshot,
				originalName,
				contentPath: contentPath || snapshot.path || ''
			};

			if (confirmDeletions) {
				payload.confirmDeletions = 'true';
			}

			const response = await fetch('?/saveCollection', {
				method: 'POST',
				body: obj2formData(payload)
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const result = await response.json();
			let data = result;
			if (result.type === 'success' && result.data) {
				data = typeof result.data === 'string' ? JSON.parse(result.data) : result.data;
			}

			// Check for drift detection from server (status 202)
			if (data?.driftDetected) {
				migrationPlan = data.plan;
				showWarningModal = true;
				toaster.info({
					description: 'Manual confirmation required for schema changes'
				});
				return;
			}

			if (response.status === 200 || (data && data.status === 200)) {
				toaster.success({ description: 'Collection Saved Successfully' });
				showWarningModal = false;
				migrationPlan = null;
				if (originalName !== snapshot?.name) {
					originalName = String(snapshot?.name ?? '');
				}
				setCollection(snapshot);
				justSaved = true;
				// Invalidate content so layout (sidebar) and edit page load get fresh data after rename/save
				await invalidate('app:content');
				await invalidateAll();
				// Create: go to edit page for the new collection; Edit: go to collection builder list
				const editPath = data?.editPath;
				if (action === 'new' && typeof editPath === 'string' && editPath) {
					goto(`/config/collectionbuilder/edit/${editPath}`);
				} else {
					goto('/config/collectionbuilder');
				}
			}
		} catch (error) {
			logger.error('Save failed', error);
			toaster.error({ description: 'Failed to save collection' });
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
					toaster.success({ description: 'Collection Deleted' });
					goto('/config/collectionbuilder');
				} else {
					toaster.error({ description: 'Failed to delete collection' });
				}
			}
		});
	}

	let activeSection = $state('general');
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
				{activeSection === 'general'
				? 'border-primary-500 text-primary-500'
				: 'border-transparent text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'}"
			onclick={() => {
				activeSection = 'general';
				document.getElementById('general-info')?.scrollIntoView({ behavior: 'smooth' });
			}}
		>
			<iconify-icon icon="mdi:information" width="18"></iconify-icon>
			General Info
		</button>
		<button
			class="flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2
				{activeSection === 'fields'
				? 'border-primary-500 text-primary-500'
				: 'border-transparent text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'}"
			onclick={() => {
				activeSection = 'fields';
				document.getElementById('fields-config')?.scrollIntoView({ behavior: 'smooth' });
			}}
		>
			<iconify-icon icon="mdi:widgets" width="18"></iconify-icon>
			Field Configuration
		</button>
	</div>

	<!-- Scrollable Content (full width) -->
	<div
		class="flex-1 overflow-y-auto p-4 sm:p-6 scroll-smooth"
		onscroll={(e) => {
			const target = e.currentTarget as HTMLElement;
			const fieldsTop = document.getElementById('fields-config')?.offsetTop || 0;
			activeSection = target.scrollTop > fieldsTop - 100 ? 'fields' : 'general';
		}}
	>
		<div class="mx-auto max-w-7xl w-full space-y-12">
			<!-- Section 1: General Info -->
			<section id="general-info" class="rounded-xl border border-surface-200-800 bg-surface-50-950 p-6 shadow-sm">
				<div class="mb-4 flex items-center gap-2 border-b border-surface-200-800 pb-2">
					<iconify-icon icon="mdi:cog" width="24" class="text-primary-500"></iconify-icon>
					<h2 class="text-xl font-bold">General Configuration</h2>
				</div>
				<CollectionForm
					data={data?.collection ?? collectionValue ?? undefined}
					handlePageTitleUpdate={(t: string) => collectionValue && (collectionValue.name = t)}
				/>
			</section>

			<!-- Section 2: Fields -->
			<section id="fields-config" class="rounded-xl border border-surface-200-800 bg-surface-50-950 p-4 shadow-sm sm:p-6">
				<div class="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-surface-200-800 pb-2">
					<div class="flex items-center gap-2">
						<iconify-icon icon="mdi:widgets" width="24" class="shrink-0 text-primary-500"></iconify-icon>
						<h2 class="text-lg font-bold sm:text-xl">Field Definitions</h2>
					</div>
					<span class="text-xs text-surface-500"> {collectionValue?.fields?.length || 0} fields total </span>
				</div>
				<CollectionWidgetOptimized fields={(collectionValue?.fields as FieldInstance[]) || []} />
			</section>
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
