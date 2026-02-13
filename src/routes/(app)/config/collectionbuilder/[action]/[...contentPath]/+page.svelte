<script lang="ts">
	import { logger } from '@utils/logger';
	import axios from 'axios';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	// Stores
	import { collection, setCollection } from '@src/stores/collectionStore.svelte';
	import { setRouteContext } from '@src/stores/UIStore.svelte.ts';
	import { validationStore, toaster } from '@src/stores/store.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Components
	import CollectionForm from './tabs/CollectionForm.svelte';
	import CollectionWidgetOptimized from './tabs/CollectionWidgetOptimized.svelte';
	import ModalSchemaWarning from '../../ModalSchemaWarning.svelte';
	import PageTitle from '@components/PageTitle.svelte';

	// Utils
	import { obj2formData } from '@utils/utils';
	import { showConfirm } from '@utils/modalUtils';
	import { widgetStoreActions } from '@stores/widgetStore.svelte.ts';

	import type { User } from '@src/databases/auth/types';
	import type { FieldInstance, Schema } from '@src/content/types';

	const action = $state(page.params.action);

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

	onMount(() => {
		widgetStoreActions.initializeWidgets();
		if (action === 'edit' && data.collection) {
			setCollection(data.collection);
			originalName = String(data.collection.name || '');
		} else {
			setCollection({
				name: 'new',
				icon: 'bi:collection',
				status: 'unpublished',
				slug: '',
				fields: []
			} as any);
		}

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
		return () => window.removeEventListener('keydown', handleKeyDown);
	});

	const collectionValue = $derived(collection.value);

	async function handleCollectionSave(confirmDeletions = false) {
		if (validationStore.errors && Object.keys(validationStore.errors).length > 0) {
			toaster.error({ description: 'Please fix validation errors before saving' });
			return;
		}

		try {
			isLoading = true;
			const currentCollection = collection.value;
			const payload: any = {
				originalName,
				...currentCollection
			};

			if (confirmDeletions) {
				payload.confirmDeletions = 'true';
			}

			const resp = await axios.post(`?/saveCollection`, obj2formData(payload), {
				headers: { 'Content-Type': 'multipart/form-data' }
			});

			// Check for drift detection from server (status 202)
			if (resp.data.data && resp.data.data.driftDetected) {
				migrationPlan = resp.data.data.plan;
				showWarningModal = true;
				toaster.info({ description: 'Manual confirmation required for schema changes' });
				return;
			}

			if (resp.status === 200 || (resp.data && resp.data.status === 200)) {
				toaster.success({ description: 'Collection Saved Successfully' });
				showWarningModal = false;
				migrationPlan = null;
				if (originalName !== currentCollection?.name) {
					originalName = String(currentCollection?.name);
					goto(`/config/collectionbuilder/edit/${originalName}`);
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
				await axios.post(`?/deleteCollections`, obj2formData({ ids: JSON.stringify([collectionValue?._id]) }), {
					headers: { 'Content-Type': 'multipart/form-data' }
				});
				toaster.success({ description: 'Collection Deleted' });
				goto('/config/collectionbuilder');
			}
		});
	}

	$effect(() => {
		setRouteContext({ isCollectionBuilder: true });
		return () => setRouteContext({ isCollectionBuilder: false });
	});

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
				<span class="hidden sm:inline">{m.button_delete()}</span>
			</button>
		{/if}
		<button onclick={() => handleCollectionSave()} class="preset-filled-primary-500 btn flex items-center gap-1 min-w-[100px]" disabled={isLoading}>
			{#if isLoading}
				<iconify-icon icon="mdi:loading" width="20" class="animate-spin"></iconify-icon>
			{:else}
				<iconify-icon icon="mdi:content-save" width="20"></iconify-icon>
			{/if}
			<span>{m.button_save()}</span>
		</button>
	</div>
</PageTitle>

<div class="flex h-[calc(100vh-120px)] flex-col lg:flex-row">
	<!-- Mini Sticky Nav -->
	<nav class="flex border-b border-surface-200-800 p-2 lg:w-48 lg:flex-col lg:border-b-0 lg:border-r">
		<button
			class="flex items-center gap-2 rounded px-3 py-2 text-left text-sm transition-colors {activeSection === 'general'
				? 'bg-primary-500/10 text-primary-500'
				: 'hover:bg-surface-100-900'}"
			onclick={() => {
				activeSection = 'general';
				document.getElementById('general-info')?.scrollIntoView({ behavior: 'smooth' });
			}}
		>
			<iconify-icon icon="mdi:information" width="18"></iconify-icon>
			General Info
		</button>
		<button
			class="flex items-center gap-2 rounded px-3 py-2 text-left text-sm transition-colors {activeSection === 'fields'
				? 'bg-primary-500/10 text-primary-500'
				: 'hover:bg-surface-100-900'}"
			onclick={() => {
				activeSection = 'fields';
				document.getElementById('fields-config')?.scrollIntoView({ behavior: 'smooth' });
			}}
		>
			<iconify-icon icon="mdi:widgets" width="18"></iconify-icon>
			Field Configuration
		</button>
	</nav>

	<!-- Scrollable Content -->
	<div
		class="flex-1 overflow-y-auto p-6 scroll-smooth"
		onscroll={(e) => {
			const target = e.currentTarget as HTMLElement;
			const fieldsTop = document.getElementById('fields-config')?.offsetTop || 0;
			activeSection = target.scrollTop > fieldsTop - 100 ? 'fields' : 'general';
		}}
	>
		<div class="mx-auto max-w-5xl space-y-12">
			<!-- Section 1: General Info -->
			<section id="general-info" class="rounded-xl border border-surface-200-800 bg-surface-50-950 p-6 shadow-sm">
				<div class="mb-4 flex items-center gap-2 border-b border-surface-200-800 pb-2">
					<iconify-icon icon="mdi:cog" width="24" class="text-primary-500"></iconify-icon>
					<h2 class="text-xl font-bold">General Configuration</h2>
				</div>
				<CollectionForm data={collectionValue} handlePageTitleUpdate={(t: string) => collectionValue && (collectionValue.name = t)} />
			</section>

			<!-- Section 2: Fields -->
			<section id="fields-config" class="rounded-xl border border-surface-200-800 bg-surface-50-950 p-6 shadow-sm">
				<div class="mb-4 flex items-center justify-between border-b border-surface-200-800 pb-2">
					<div class="flex items-center gap-2">
						<iconify-icon icon="mdi:widgets" width="24" class="text-primary-500"></iconify-icon>
						<h2 class="text-xl font-bold">Field Definitions</h2>
					</div>
					<span class="text-xs text-surface-500">
						{collectionValue?.fields?.length || 0} fields total
					</span>
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
