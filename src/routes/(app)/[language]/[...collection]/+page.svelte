<!--
@file src/routes/(app)/[language]/[...collection]/+page.svelte
@component
**This component acts as a layout and data router for the collection view.**

## Navigation Architecture (GUI-First Pattern):

### PRIMARY: GUI Actions (90% of navigation)
1. User hovers button → Preload data to cache
2. User clicks button → Check cache → setMode() → URL reflects change
3. FAST: No goto(), no SSR reload, instant mode switching

### SECONDARY: URL Changes (10% - manual edits)
1. User manually edits URL → Detect change in $effect
2. Parse URL → Translate to UUID → setMode() → Load if not cached
3. SLOWER: Required SSR reload only when user types URL directly

## Features:
- Receives all page data (schema, entries, pagination) from the server-side `load` function.
- Passes server-loaded data as props to the `EntryList` or `Fields` components.
- URL-to-mode translation for manual URL edits (browser address bar changes).
- Auto-saves unsaved changes as draft when navigating away to prevent data loss.

-->
<script lang="ts">
	import { logger } from '@utils/logger';
	import { beforeNavigate, invalidateAll, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { untrack, onMount } from 'svelte';
	import { collection, mode, setCollection, collectionValue, setMode, setCollectionValue } from '@src/stores/collectionStore.svelte';
	import { contentLanguage, validationStore } from '@stores/store.svelte';
	import { parseURLToMode } from '@utils/navigationUtils';
	import { getFieldName } from '@utils/utils';
	import EntryList from '@src/components/collectionDisplay/EntryList.svelte';
	import Fields from '@src/components/collectionDisplay/Fields.svelte';
	import { toaster } from '@stores/store.svelte';
	import type { Schema } from '@src/content/types';

	interface PageData {
		collectionSchema: Schema;
		entries: any[];
		pagination: {
			totalItems: number;
			pagesCount: number;
			currentPage: number;
			pageSize: number;
		};
		revisions: any[];
		contentLanguage: string;
	}

	const { data }: { data: PageData } = $props();

	// Use $derived for reactivity from server-loaded data
	const collectionSchema = $derived(data?.collectionSchema);
	const entries = $derived(data?.entries || []);
	const pagination = $derived(data?.pagination || { currentPage: 1, pageSize: 10, totalItems: 0, pagesCount: 1 });
	const revisions = $derived(data?.revisions || []);
	const serverContentLanguage = $derived(data?.contentLanguage);

	// Debug: Monitor data prop changes
	$effect(() => {
		logger.debug('[+page.svelte] Data changed:', {
			schemaId: data?.collectionSchema?._id,
			schemaName: data?.collectionSchema?.name,
			entriesCount: data?.entries?.length,
			storeId: collection.value?._id,
			storeName: collection.value?.name
		});
	});

	// Track initial collectionValue to detect changes
	let initialCollectionValue = $state('');
	let userClickedCancel = $state(false);
	let isSavingDraft = $state(false);

	// Track when we last received server data to avoid overwriting client-side language changes
	let lastServerLanguage: string | undefined = $state(undefined);

	// Track if we've initialized validation for the current create session
	let validationInitialized = $state(false);

	// Initialize validation IMMEDIATELY for create mode using $effect.pre()
	// This runs synchronously BEFORE DOM updates, ensuring button state is correct on first render
	$effect.pre(() => {
		const createParam = page.url.searchParams.get('create');

		if (createParam === 'true' && collectionSchema && !validationInitialized) {
			// Clear all errors first to start fresh
			validationStore.clearAllErrors();

			// Initialize validation for all required fields
			const fields = collectionSchema.fields || [];
			let errorCount = 0;
			for (const field of fields) {
				const fieldDef = field as any;
				if (fieldDef.required) {
					const fieldName = getFieldName(fieldDef, false);
					validationStore.setError(fieldName, `${fieldDef.label || fieldName} is required`);
					errorCount++;
					console.log('🔴 [Validation Init] Set error for required field:', fieldName);
				}
			}

			validationInitialized = true;
			console.log('✅ [Validation Init] Initialized', errorCount, 'required field errors, isValid:', validationStore.isValid);
		} else if (createParam !== 'true') {
			// Reset flag when leaving create mode
			if (validationInitialized) {
				console.log('🔄 [Validation Init] Resetting validation flag');
				validationInitialized = false;
			}
		}
	});

	// Sync contentLanguage store with server data
	// IMPORTANT: Server language (URL) takes precedence over cookie/store
	// This MUST run immediately when data changes to ensure widgets get correct language
	// BUT: Only sync when we receive NEW server data (not on client-side URL changes)
	$effect(() => {
		if (serverContentLanguage) {
			// Only sync if server language actually changed (indicates new server load)
			if (serverContentLanguage !== lastServerLanguage) {
				const currentStoreLanguage = contentLanguage.value;
				if (currentStoreLanguage !== serverContentLanguage) {
					logger.debug('[+page.svelte] Syncing contentLanguage from server:', currentStoreLanguage, '→', serverContentLanguage);
					// Set without untrack to ensure all reactive subscribers are notified
					contentLanguage.set(serverContentLanguage as any);
					logger.debug('[+page.svelte] ContentLanguage store now:', contentLanguage.value);
				}
				lastServerLanguage = serverContentLanguage;
			}
		}
	});

	// Initial collection store sync - ensures store has correct schema on first load
	// CRITICAL: Always sync when collectionSchema changes to keep store in sync with server data
	$effect(() => {
		if (collectionSchema) {
			const currentStoreId = collection.value?._id;
			const schemaId = collectionSchema._id;
			// Only update if different to avoid unnecessary re-renders
			if (currentStoreId !== schemaId) {
				logger.debug('[+page.svelte] Syncing collection store:', currentStoreId, '→', schemaId, collectionSchema.name);
				setCollection(collectionSchema);
			}
		}
	});

	let isMounted = $state(false);

	onMount(() => {
		isMounted = true;
	});

	$effect(() => {
		if (isMounted && typeof window !== 'undefined') {
			const currentPath = page.url.pathname;
			const collectionIdFromPath = currentPath.split('/').pop() || '';
			const isUUID = /^[a-f0-9]{32}$/i.test(collectionIdFromPath);

			// Only replace URL if:
			// 1. The URL contains a UUID
			// 2. We have a collection schema with a path
			// 3. The collection schema ID matches the UUID in the URL (ensures data is loaded for correct collection)
			if (isUUID && collectionSchema?.path && collectionSchema._id === collectionIdFromPath) {
				const newPath = `/${serverContentLanguage}${collectionSchema.path}${page.url.search}`;
				if (newPath !== currentPath) {
					logger.debug(`[URL Update] Replacing UUID path with pretty path: ${newPath}`);
					// Use SvelteKit's replaceState to avoid interfering with navigation state
					setTimeout(() => {
						replaceState(newPath, {});
					}, 0);
				}
			}
		}
	});

	// ============================================================================
	// URL-TO-MODE TRANSLATION & INITIAL LOAD DETECTION
	// ============================================================================
	// Handles both:
	// 1. Initial page load with ?edit=id in URL
	// 2. Manual URL changes (user types in address bar)
	// 3. Language changes in edit mode (URL language prefix changes but ?edit=id stays same)
	// 4. Collection changes (navigation between different collections)

	let lastUrlString: string = $state('');
	let lastEditParam: string | null = $state(null);
	let hasInitiallyLoaded = $state(false);
	let lastCollectionId: string | null = $state(null);

	// Track collection changes - when navigating to a different collection, reset state
	$effect(() => {
		const currentCollectionId = collectionSchema?._id as string | undefined;
		if (currentCollectionId && currentCollectionId !== lastCollectionId) {
			logger.debug('[Collection Change] Detected collection switch:', lastCollectionId, '→', currentCollectionId);
			logger.debug('[Collection Change] New entries count:', entries.length, 'pagination:', pagination);

			// CRITICAL: Sync collection store with server data
			// This ensures collection.value is updated when navigating between collections
			if (collectionSchema) {
				setCollection(collectionSchema);
				logger.debug('[Collection Change] Store synced with server data:', collectionSchema.name);
			}

			// Reset state tracking for the new collection
			hasInitiallyLoaded = false;
			lastEditParam = null;
			lastUrlString = '';
			// Update tracking
			lastCollectionId = currentCollectionId;
			// Set mode to view for new collection (unless URL says otherwise)
			const editParam = page.url.searchParams.get('edit');
			const createParam = page.url.searchParams.get('create');
			if (!editParam && !createParam) {
				setMode('view');
			}
		}
	});

	$effect(() => {
		const currentUrl = page.url.toString();
		const editParam = page.url.searchParams.get('edit');
		const createParam = page.url.searchParams.get('create');

		// CASE 1: Initial page load with ?edit=id
		if (!hasInitiallyLoaded && editParam && entries && entries.length === 1) {
			hasInitiallyLoaded = true;
			lastEditParam = editParam;
			const entryData = entries[0];
			logger.debug('[Initial Load] Edit mode detected, loading entry:', entryData._id);

			setMode('edit');
			setCollectionValue(entryData);
			initialCollectionValue = JSON.stringify(entryData);
			lastUrlString = currentUrl;
			return; // Exit early to avoid triggering URL change logic
		}

		// CASE 1b: Initial page load with ?create=true
		if (!hasInitiallyLoaded && createParam === 'true') {
			hasInitiallyLoaded = true;
			lastUrlString = currentUrl;

			setMode('create');
			const newEntry: Record<string, any | null> = {};
			const fields = collection.value?.fields || [];

			// Initialize empty entry
			for (const field of fields) {
				const fieldName = getFieldName(field as any, false);
				newEntry[fieldName] = null;
			}
			setCollectionValue(newEntry);

			// ✅ Validation is now handled by $effect.pre() above
			// No need to duplicate validation logic here

			// Initialize change tracking
			initialCollectionValue = JSON.stringify(newEntry);

			logger.debug('[Initial Load] Create mode detected, entry initialized');
			return; // Exit early to avoid triggering URL change logic
		}

		// CASE 2: URL changed (manual navigation)
		if (currentUrl !== lastUrlString && hasInitiallyLoaded) {
			// Check if only language changed (URL language prefix) but params stayed the same
			const editParamChanged = editParam !== lastEditParam;
			const wasInCreateMode = lastUrlString.includes('create=true');
			const isInCreateMode = createParam === 'true';

			// If we're in edit/create mode and only URL language changed, ignore the URL change
			// This happens when user changes language in TranslationStatus dropdown
			if ((mode.value === 'edit' || mode.value === 'create') && editParam === lastEditParam && isInCreateMode === wasInCreateMode) {
				logger.debug('[URL Change] Language prefix changed, but staying in', mode.value, 'mode (no reload needed)');
				lastUrlString = currentUrl;
				return; // Don't reload data, just update URL tracking
			}

			lastUrlString = currentUrl;
			lastEditParam = editParam;
			const parsed = parseURLToMode(page.url);

			logger.debug(`[URL Change] ${mode.value} → ${parsed.mode}`, {
				entryId: parsed.entryId,
				hasEntries: entries.length,
				editParamChanged
			});

			// Edit mode from URL change
			if (parsed.mode === 'edit' && parsed.entryId && editParamChanged) {
				if (entries && entries.length === 1) {
					// Data already loaded by server
					const entryData = entries[0];
					setMode('edit');
					setCollectionValue(entryData);
					initialCollectionValue = JSON.stringify(entryData);
				} else {
					// Need to reload data
					invalidateAll().then(() => {
						setMode('edit');
						logger.debug(`[URL Change] Reloaded entry ${parsed.entryId}`);
					});
				}
			} else if (parsed.mode === 'view' && mode.value === 'edit') {
				// Exiting edit mode
				setMode('view');
			} else if (parsed.mode === 'create') {
				// Create mode (URL change while already loaded)
				setMode('create');
				const newEntry: Record<string, any | null> = {};
				const fields = collection.value?.fields || [];

				// Initialize empty entry with null values
				for (const field of fields) {
					const fieldName = getFieldName(field as any, false);
					newEntry[fieldName] = null;
				}
				setCollectionValue(newEntry);

				// 🔧 FIX: Perform initial validation for required fields
				validationStore.clearAllErrors();

				// Initialize change tracking
				initialCollectionValue = JSON.stringify(newEntry);

				for (const field of fields) {
					const fieldDef = field as any;
					if (fieldDef.required) {
						const fieldName = getFieldName(fieldDef, false);
						const value = newEntry[fieldName];

						// Validate required field
						if (value === null || value === undefined || value === '') {
							validationStore.setError(fieldName, `${fieldDef.label || fieldName} is required`);
						}
					}
				}

				logger.debug('[URL Change] Create mode validation initialized');
			} else if (mode.value !== parsed.mode) {
				// Other mode changes
				setMode(parsed.mode);
			}
		}

		// CASE 3: Mark as loaded after first render (for view mode)
		if (!hasInitiallyLoaded && !editParam) {
			hasInitiallyLoaded = true;
			lastEditParam = editParam;
			lastUrlString = currentUrl;
		}
	});

	// Sync collection schema from server data
	$effect(() => {
		if (collectionSchema) {
			setCollection(collectionSchema);
		}
	});

	// Track initial state when entering edit mode
	// This runs AFTER collectionValue is set, but doesn't trigger when collectionValue changes
	$effect(() => {
		const currentMode = mode.value;
		if (currentMode === 'edit' || currentMode === 'create') {
			// Use untrack to read collectionValue without creating a dependency
			const currentValue = untrack(() => collectionValue.value);
			if (currentValue) {
				initialCollectionValue = JSON.stringify(currentValue);
				userClickedCancel = false; // Reset cancel flag
			}
		}
	});

	// Auto-save draft function
	async function autoSaveDraft(): Promise<boolean> {
		if (isSavingDraft) return false;

		isSavingDraft = true;
		try {
			const entryData = collectionValue.value as any;
			const collectionId = collection.value?._id;
			const tenantId = page.data?.tenantId;

			if (!collectionId || !entryData) {
				return false;
			}

			// Use collection's default status or current entry status
			// FORCE 'draft' status for auto-saves to bypass validation for required fields
			const draftData = {
				...entryData,
				status: 'draft',
				updatedAt: new Date().toISOString()
			};

			// Determine if creating new or updating existing
			const isNewEntry = !entryData._id;
			const endpoint = isNewEntry ? `/api/collections/${collectionId}` : `/api/collections/${collectionId}/${entryData._id}`;

			const method = isNewEntry ? 'POST' : 'PUT';

			const response = await fetch(endpoint, {
				method,
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					data: draftData,
					tenantId
				})
			});

			if (response.ok) {
				const result = await response.json();

				// Update collectionValue with the saved draft (including _id for new entries)
				if (isNewEntry && result.data?._id) {
					collectionValue.value = { ...draftData, _id: result.data._id };
				}

				logger.debug('[Auto-save] Draft saved successfully');
				return true;
			} else {
				logger.error('[Auto-save] Failed to save draft:', response.statusText);
				return false;
			}
		} catch (error) {
			logger.error('[Auto-save] Error saving draft:', error);
			return false;
		} finally {
			isSavingDraft = false;
		}
	}

	// Listen for cancel and save events
	$effect(() => {
		const handleCancelClick = () => {
			userClickedCancel = true;
			logger.debug('[Auto-save] Cancel clicked - no draft will be saved');
		};

		const handleEntrySaved = () => {
			// Update baseline to match current value, preventing unsaved changes detection
			if (collectionValue.value) {
				initialCollectionValue = JSON.stringify(collectionValue.value);
				logger.debug('[Auto-save] Entry saved manually - baseline updated');
			}
		};

		document.addEventListener('cancelEdit' as any, handleCancelClick as EventListener);
		document.addEventListener('entrySaved' as any, handleEntrySaved as EventListener);

		return () => {
			document.removeEventListener('cancelEdit' as any, handleCancelClick as EventListener);
			document.removeEventListener('entrySaved' as any, handleEntrySaved as EventListener);
		};
	});

	// Navigation guard: auto-save draft if changes exist
	beforeNavigate(async ({ cancel }) => {
		// Skip if user clicked cancel button
		if (userClickedCancel) {
			logger.debug('[Auto-save] Skipping auto-save due to cancel');
			userClickedCancel = false;
			return;
		}

		// Only check if we're in edit/create mode and have unsaved changes
		if (['edit', 'create'].includes(mode.value) && collectionValue.value) {
			const currentValue = JSON.stringify(collectionValue.value);
			const hasUnsavedChanges = currentValue !== initialCollectionValue;

			if (hasUnsavedChanges && !isSavingDraft) {
				logger.debug('[Auto-save] Detected unsaved changes, auto-saving as draft...');

				// Cancel navigation temporarily
				cancel();

				// Auto-save as draft
				const saved = await autoSaveDraft();

				if (saved) {
					toaster.success({ description: 'Changes auto-saved as draft' });
					// Update initial value to prevent re-saving
					initialCollectionValue = JSON.stringify(collectionValue.value);
					// Allow navigation to continue
					setMode('view');
				} else {
					toaster.error({ description: 'Failed to auto-save. Please save manually.' });
				}
			}
		}
	});
</script>

<svelte:head>
	<title>{collectionSchema?.name ?? 'Collection'} - SveltyCMS</title>
</svelte:head>

<div class="content h-full">
	<!-- Auto-save indicator -->
	{#if isSavingDraft}
		<div class="fixed right-4 top-20 z-50 flex items-center gap-2 rounded-lg bg-warning-500 px-4 py-2 text-white shadow-lg">
			<div class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
			<span class="text-sm font-medium">Auto-saving draft...</span>
		</div>
	{/if}

	{#if !collection.value}
		<!-- Collection data should be available from SSR, if not show error -->
		<div class="dark:bg-error-950 flex h-64 flex-col items-center justify-center rounded-lg border border-error-500 bg-error-50 p-8">
			<svg class="mb-4 h-16 w-16 text-error-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
				/>
			</svg>
			<h3 class="mb-2 text-xl font-bold text-error-600 dark:text-error-400">Collection Not Loaded</h3>
			<p class="text-center text-error-600 dark:text-error-400">Unable to load collection schema. Please refresh the page.</p>
		</div>
	{:else if mode.value === 'view' || mode.value === 'modify'}
		<!-- Key block forces EntryList to remount when collection changes -->
		{#key collectionSchema?._id}
			<EntryList {entries} {pagination} contentLanguage={serverContentLanguage} />
		{/key}
	{:else if ['edit', 'create'].includes(mode.value)}
		<div id="fields_container" class="fields max-h-[calc(100vh-100px)] overflow-y-auto overflow-x-visible max-md:max-h-[calc(100vh-120px)]">
			<!-- Pass the server-loaded data directly as props -->
			<Fields fields={collection.value.fields} {revisions} contentLanguage={serverContentLanguage} />
		</div>
	{/if}
</div>
