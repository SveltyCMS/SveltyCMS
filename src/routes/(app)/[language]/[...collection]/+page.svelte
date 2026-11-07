<!--
@file src/routes/(app)/[language]/[...collection]/+page.svelte
@component
**Collection Dashboard**: The main router for entry listing, editing, and creation.

This page dynamically switches between List views and Field editors based on the `?edit` or `?create` parameters.

### Current Mode Logic:
- `view`: Displays EntryList with pagination and search.
- `edit`: Displays Fields editor with revision history.
- `create`: Displays empty Fields editor for new entry creation.

### Next Steps & Options:
- Click a row to enter `edit` mode.
- Press "Create New" to enter `create` mode.
- Change language in the translation dropdown to translate specific entries.
- Save or Cancel edits (triggers auto-save/draft logic).
-->
<script lang="ts">
	import { contentLanguage } from '@src/stores/locale-store.svelte';
	import { validationStore } from '@src/stores/validation-store.svelte';
	import {
		collection_autosaving_draft,
		collection_not_loaded,
		collection_unable_to_load,
		page_title_suffix
	} from '@src/paraglide/messages';
	import EntryList from '@src/components/collection-display/entry-list.svelte';
	import Fields from '@src/components/collection-display/fields.svelte';
	import WorkflowActions from '@src/components/collection-display/workflow-actions.svelte';
	import type { Schema } from '@src/content/types';
	import { collections } from '@src/stores/collection-store.svelte';
	import { widgets } from '@src/stores/widget-store.svelte';

	import { logger } from '@utils/logger';
	import { parseURLToMode } from '@utils/navigation';
	import { toast } from '@src/stores/toast.svelte.ts';
	import {
		discardDraft,
		discardDraftsForEntry,
		getDraft,
		saveDraft as saveDraftRequest
	} from '@utils/api';
	import { getFieldName } from '@utils/schema/field-utils';
	import { nowISODateString } from '@utils/date';
	import { guardNavigationAutosave } from '@utils/entry-autosave';
	import {
		discardEntryDrafts,
		draftDiscardKey,
		hasRestorableChanges,
		isNewEntryDraft,
		readDraftResume,
		saveEntryDraft,
		type DraftResume
	} from '@utils/entry-drafts';
	import DraftResumeBanner from '@src/components/collection-display/draft-resume-banner.svelte';
	import { onMount, untrack } from 'svelte';
	import { beforeNavigate, refreshAll, goto } from '$app/navigation';
	import { page } from '$app/state';

	interface PageData {
		collectionSchema: Schema;
		contentLanguage: string;
		entries: any[];
		pagination: {
			totalItems: number;
			pagesCount: number;
			currentPage: number;
			pageSize: number;
		};
		revisions: any[];
		/**
		 * Author's latest draft for the form this load is opening, read through the
		 * SDK. `null` when there is nothing to resume (or the drafts lane is not
		 * mounted yet) — the editor then behaves exactly as before.
		 */
		draftResume?: DraftResume | null;
		/** Streamed by the loader: resolves to {} on failure, never rejects. */
		statusFacets?: Promise<Partial<Record<string, number>>>;
		listMetrics?: Record<string, unknown> | null;
	}

	const { data }: { data: PageData } = $props();

	// Use $derived for reactivity from server-loaded data
	const collectionSchema = $derived(data?.collectionSchema);
	const activeCollection = $derived(collectionSchema ?? collections.active);
	const entries = $derived(data?.entries || []);
	const pagination = $derived(
		data?.pagination || {
			currentPage: 1,
			pageSize: 10,
			totalItems: 0,
			pagesCount: 1
		}
	);
	const revisions = $derived(data?.revisions || []);
	const serverContentLanguage = $derived(data?.contentLanguage);

	// Streamed status facets — pending renders empty chips, then swaps in counts.
	const statusFacets = $derived(
		data?.statusFacets ?? Promise.resolve<Partial<Record<string, number>>>({})
	);

	// Track initial collectionValue to detect changes
	let initialCollectionValue = $state('');
	let userClickedCancel = $state(false);
	let isSavingDraft = $state(false);

	// ── Draft/live separation ─────────────────────────────────────────────────
	// Autosave writes a `content_drafts` row, never the live entry. The server
	// loader reads the author's latest draft for the form being opened; row
	// activation and Create read it client-side. `resumeDraft` is only an OFFER:
	// applying it fills the form, it never creates (or stamps an id onto) an entry.
	let resumeDraft = $state<DraftResume | null>(null);
	let isDraftBusy = $state(false);
	/** Draft row behind the current form (from a resume or an autosave). */
	let trackedDraftId = $state<string | null>(null);
	/** `contentId` of that draft — the address a new-entry draft re-upserts under. */
	let trackedDraftContentId = $state<string | null>(null);
	/** True while the tracked draft belongs to a form with no live entry. */
	let trackedDraftIsNew = $state(false);
	/** Last form the draft lookup ran for — one read per opened form. */
	let draftLookupKey = '';
	let consumedServerResume = false;
	/** One discard per form: Save + Cancel must not delete the same draft twice. */
	const discardedDraftKeys = new Set<string>();

	// Track when we last received server data to avoid overwriting client-side language changes
	let lastServerLanguage: string | undefined = $state(undefined);

	// Track if we've initialized validation for the current create session
	let validationInitialized = $state(false);

	// Sync contentLanguage, collection schema, and initial validation IMMEDIATELY
	// using $effect.pre() so collections.active is populated BEFORE the first DOM render
	$effect.pre(() => {
		if (serverContentLanguage) {
			untrack(() => {
				if (serverContentLanguage !== lastServerLanguage) {
					if (contentLanguage.value !== serverContentLanguage) {
						logger.debug('[+page.svelte] Syncing language:', serverContentLanguage);
						contentLanguage.value = serverContentLanguage as any;
					}
					lastServerLanguage = serverContentLanguage;
				}
			});
		}

		if (collectionSchema) {
			untrack(() => {
				const currentStoreId = collections.active?._id;
				if (currentStoreId !== collectionSchema._id) {
					logger.debug('[+page.svelte] Syncing collection store:', collectionSchema.name);
					collections.setCollection(collectionSchema);
				}
			});
		}

		const createParam = page.url.searchParams.get('create');

		if (createParam === 'true' && collectionSchema && !validationInitialized) {
			untrack(() => {
				// Clear all errors first to start fresh
				validationStore.clearAllErrors();

				// Initialize validation for all required fields
				const fields = collectionSchema.fields || [];
				for (const field of fields) {
					const fieldDef = field as any;
					if (fieldDef.required) {
						const fieldName = getFieldName(fieldDef, false);
						const defaultValue = fieldDef.default;
						// A field with a default is already populated on create.
						if (defaultValue === undefined || defaultValue === null || defaultValue === '') {
							validationStore.setError(fieldName, `${fieldDef.label || fieldName} is required`);
						}
					}
				}

				validationInitialized = true;
			});
		} else if (createParam !== 'true') {
			// Reset flag when leaving create mode
			if (validationInitialized) {
				validationInitialized = false;
			}
		}
	});

	let isMounted = $state(false);

	onMount(() => {
		isMounted = true;
		// Ensure widgets are initialized if layout mount was skipped or delayed
		if (!widgets.isLoaded) {
			logger.debug('[+page.svelte] Initializing widgets on mount');
			widgets.initialize();
		}
	});

	$effect(() => {
		if (isMounted && typeof window !== 'undefined' && collectionSchema?.path) {
			const currentPath = page.url.pathname;
			const collectionIdFromPath = currentPath.split('/').pop() || '';
			const isUUID = /^[a-f0-9]{32}$/i.test(collectionIdFromPath);

			// Only replace URL if it contains a UUID and we have a corresponding pretty path
			if (isUUID && collectionSchema._id === collectionIdFromPath) {
				const newPath = `/${serverContentLanguage}${collectionSchema.path}${page.url.search}`;
				if (newPath !== currentPath) {
					logger.debug(`[URL Update] UUID → Pretty: ${newPath}`);
					untrack(() => {
						// Use shallow goto at the end of the microtask to avoid recursive updates
						Promise.resolve().then(() => {
							if (page.url.pathname === currentPath) {
								goto(newPath, { shallow: true, replace: true, state: {} });
							}
						});
					});
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

	const urlEditParam = $derived(page.url.searchParams.get('edit'));
	const urlCreateParam = $derived(page.url.searchParams.get('create'));
	const effectiveMode = $derived(
		hasInitiallyLoaded
			? collections.mode
			: urlEditParam
				? 'edit'
				: urlCreateParam === 'true'
					? 'create'
					: collections.mode
	);

	// Track collection changes - when navigating to a different collection, reset state
	// Track collection changes for mode resetting
	$effect.pre(() => {
		const currentCollectionId = collectionSchema?._id as string | undefined;
		if (currentCollectionId && currentCollectionId !== lastCollectionId) {
			untrack(() => {
				// Reset state tracking for the new collection
				hasInitiallyLoaded = false;
				lastEditParam = null;
				lastUrlString = '';
				lastCollectionId = currentCollectionId;

				// Set mode to view for new collection (unless URL says otherwise)
				const editParam = page.url.searchParams.get('edit');
				const createParam = page.url.searchParams.get('create');
				if (!(editParam || createParam)) {
					collections.setMode('view');
				}
			});
		}
	});

	$effect.pre(() => {
		const currentUrl = page.url.toString();
		const editParam = page.url.searchParams.get('edit');
		const createParam = page.url.searchParams.get('create');

		// CASE 1: Initial page load with ?edit=id
		if (!hasInitiallyLoaded && editParam && entries && entries.length >= 1) {
			untrack(() => {
				hasInitiallyLoaded = true;
				lastEditParam = editParam;
				const entryData =
					entries.find((e: any) => String(e?._id) === String(editParam)) ?? entries[0];
				logger.debug('[Initial Load] Edit mode detected, loading entry:', entryData._id);

				collections.setMode('edit');
				collections.setCollectionValue(entryData);
				initialCollectionValue = JSON.stringify(entryData);
				lastUrlString = currentUrl;
			});
			return; // Exit early to avoid triggering URL change logic
		}

		// CASE 1b: Initial page load with ?create=true
		if (!hasInitiallyLoaded && createParam === 'true') {
			untrack(() => {
				hasInitiallyLoaded = true;
				lastUrlString = currentUrl;

				collections.setMode('create');
				const newEntry: Record<string, any | null> = {};
				const fields = (collectionSchema ?? collections.active)?.fields || [];

				// Initialize entry values, honoring schema defaults (e.g. Select defaults).
				for (const field of fields) {
					const fieldDef = field as any;
					const fieldName = getFieldName(fieldDef, false);
					newEntry[fieldName] = fieldDef.default ?? null;
				}
				collections.setCollectionValue(newEntry);

				// Initialize change tracking
				initialCollectionValue = JSON.stringify(newEntry);

				logger.debug('[Initial Load] Create mode detected, entry initialized');
			});
			return; // Exit early to avoid triggering URL change logic
		}

		// CASE 2: URL changed (manual navigation)
		if (currentUrl !== lastUrlString && hasInitiallyLoaded) {
			untrack(() => {
				// Check if only language changed (URL language prefix) but params stayed the same
				const editParamChanged = editParam !== lastEditParam;
				const wasInCreateMode = lastUrlString.includes('create=true');
				const isInCreateMode = createParam === 'true';

				// If we're in edit/create mode and only URL language changed, ignore the URL change
				// This happens when user changes language in TranslationStatus dropdown
				if (
					(collections.mode === 'edit' || collections.mode === 'create') &&
					editParam === lastEditParam &&
					isInCreateMode === wasInCreateMode
				) {
					logger.debug(
						'[URL Change] Language prefix changed, but staying in',
						collections.mode,
						'mode (no reload needed)'
					);
					lastUrlString = currentUrl;
					return; // Don't reload data, just update URL tracking
				}

				lastUrlString = currentUrl;
				lastEditParam = editParam;
				const parsed = parseURLToMode(page.url);

				logger.debug(`[URL Change] ${collections.mode} → ${parsed.mode}`, {
					entryId: parsed.entryId,
					hasEntries: entries.length,
					editParamChanged
				});

				// Edit mode from URL change
				if (parsed.mode === 'edit' && parsed.entryId && editParamChanged) {
					// Clear errors from the previous entry — a stale key for a field the
					// new entry lacks would otherwise block Save (isFormValid sums all keys).
					validationStore.clearAllErrors();

					// Row activation loads the STORED document (openEntryForEdit) and only
					// then reflects the URL, so the store already holds the entry this URL
					// names. `entries` carries the one-language display projection — writing
					// it back here is exactly the data loss this route must not repeat
					// (blocker B2), so an already-loaded entry wins.
					// untrack: the URL effect must not re-run on every keystroke.
					const loadedEntryId = untrack(() => collections.activeValue?._id);
					if (loadedEntryId && String(loadedEntryId) === String(parsed.entryId)) {
						untrack(() => {
							initialCollectionValue = JSON.stringify(collections.activeValue);
						});
						return;
					}

					// No row ever seeds the form: `entries` is the one-language list
					// projection, so matching it here would hand the editor a display
					// snapshot (blocker B2). The entry named by the URL is not loaded,
					// so reload the stored document.
					refreshAll().then(() => {
						collections.setMode('edit');
						logger.debug(`[URL Change] Reloaded entry ${parsed.entryId}`);
					});
				} else if (parsed.mode === 'view' && collections.mode === 'edit') {
					// Exiting edit mode
					collections.setMode('view');
				} else if (parsed.mode === 'create') {
					// Create mode (URL change while already loaded)
					collections.setMode('create');
					const newEntry: Record<string, any | null> = {};
					const fields = (collectionSchema ?? collections.active)?.fields || [];

					// Initialize entry values, honoring schema defaults (e.g. Select defaults).
					for (const field of fields) {
						const fieldDef = field as any;
						const fieldName = getFieldName(fieldDef, false);
						newEntry[fieldName] = fieldDef.default ?? null;
					}
					collections.setCollectionValue(newEntry);

					// Perform initial validation for required fields
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
				} else if (collections.mode !== parsed.mode) {
					// Other mode changes
					collections.setMode(parsed.mode);
				}
			});
		}

		// CASE 3: Mark as loaded after first render (for view mode)
		if (!(hasInitiallyLoaded || editParam)) {
			untrack(() => {
				hasInitiallyLoaded = true;
				lastEditParam = editParam;
				lastUrlString = currentUrl;
			});
		}
	});

	// Track initial state when entering edit mode
	// This runs AFTER collections.activeValue is set, but doesn't trigger when collections.activeValue changes
	$effect(() => {
		const currentMode = collections.mode;
		if (currentMode === 'edit' || currentMode === 'create') {
			// Use untrack to read collections.activeValue without creating a dependency
			const currentValue = untrack(() => collections.activeValue);
			if (currentValue) {
				initialCollectionValue = JSON.stringify(currentValue);
				userClickedCancel = false; // Reset cancel flag
			}
		}
	});

	// ── Draft helpers ─────────────────────────────────────────────────────────

	/** Live entry id of the open form (`''` for a new entry). */
	function currentEntryId(): string {
		const value = collections.activeValue?._id;
		return value ? String(value) : '';
	}

	/** Lookup key of one form — a new-entry form has no id, so it keys on `new`. */
	function draftLookupKeyFor(collectionId: string, entryId: string): string {
		return `${collectionId}:${entryId || 'new'}`;
	}

	/**
	 * Offer the author's latest draft for one form. The server loader already read
	 * it for the form this load opened; every other form (row activation, Create
	 * from the list) reads it once, client-side.
	 */
	async function offerDraftResume(collectionId: string, entryId: string): Promise<void> {
		const key = draftLookupKeyFor(collectionId, entryId);
		if (key === draftLookupKey) return;
		draftLookupKey = key;

		// A different form is open: the previous offer and the draft address it
		// tracked belong to that form, not this one.
		resumeDraft = null;
		trackedDraftId = null;
		trackedDraftContentId = null;
		trackedDraftIsNew = false;

		const serverResume = (data?.draftResume as DraftResume | null | undefined) ?? null;
		const serverMatches =
			serverResume !== null &&
			(serverResume.isNewEntry
				? entryId === ''
				: entryId !== '' && String(serverResume.draft.contentId) === entryId);
		if (serverMatches && serverResume && !consumedServerResume) {
			consumedServerResume = true;
			resumeDraft = hasRestorableChanges(serverResume, initialCollectionValue)
				? serverResume
				: null;
			return;
		}

		const found = await readDraftResume({
			collectionId,
			entryId: entryId || undefined,
			read: getDraft
		});
		// A newer form superseded this read — its answer owns the banner.
		if (key !== draftLookupKey) return;
		resumeDraft = found && hasRestorableChanges(found, initialCollectionValue) ? found : null;
	}

	// Read the draft once per opened form. Reading only `activeValue._id` keeps the
	// effect out of every keystroke (fine-grained runes).
	$effect(() => {
		const mode = collections.mode;
		if (mode !== 'edit' && mode !== 'create') return;

		const collectionId = activeCollection?._id ? String(activeCollection._id) : '';
		if (!collectionId) return;

		const activeId = collections.activeValue?._id ? String(collections.activeValue._id) : '';
		const entryId = mode === 'edit' ? activeId || urlEditParam || '' : '';
		if (mode === 'edit' && !entryId) return;
		if (draftLookupKeyFor(collectionId, entryId) === draftLookupKey) return;

		untrack(() => {
			void offerDraftResume(collectionId, entryId);
		});
	});

	/**
	 * Apply the offered draft to the form and make it the new baseline.
	 *
	 * Never creates an entry: a new-entry draft carries no `_id` at all, and an
	 * edit draft carries the live entry's id, so Save still writes the row the
	 * form was opened for (M1).
	 */
	function restoreResumeDraft(): void {
		const resume = resumeDraft;
		if (!resume) return;

		collections.setCollectionValue({ ...resume.data });
		initialCollectionValue = JSON.stringify(collections.activeValue);
		trackedDraftId = resume.draft._id;
		trackedDraftContentId = resume.draft.contentId || null;
		trackedDraftIsNew = resume.isNewEntry;
		resumeDraft = null;

		toast.success('Draft restored');
		logger.debug('[Draft] Restored draft into the form', { draftId: resume.draft._id });
	}

	/** Discard the offered draft and keep the live/new baseline untouched. */
	async function discardResumeDraft(): Promise<void> {
		const resume = resumeDraft;
		const collectionId = activeCollection?._id ? String(activeCollection._id) : '';
		if (!resume || !collectionId) return;

		const entryId = resume.isNewEntry ? null : resume.draft.contentId || currentEntryId() || null;
		isDraftBusy = true;
		try {
			const outcome = await discardEntryDrafts({
				collectionId,
				entryId,
				draftId: resume.draft._id,
				discardOne: discardDraft,
				discardAll: discardDraftsForEntry
			});
			if (outcome === 'failed') {
				toast.error('Could not discard the draft. Please try again.');
				return;
			}

			discardedDraftKeys.add(draftDiscardKey({ collectionId, entryId, draftId: resume.draft._id }));
			resumeDraft = null;
			toast.success('Draft discarded');
			logger.debug('[Draft] Discarded draft', { draftId: resume.draft._id });
		} finally {
			isDraftBusy = false;
		}
	}

	/**
	 * Discard the drafts behind the form once the form is no longer pending:
	 * Save/Publish/Delete/Clone committed it, or Cancel abandoned it.
	 *
	 * One request per form. The key collapses repeated events (Save also fires a
	 * navigation), so a draft is never deleted twice. The backend may clear the
	 * row on commit as well — a 404 answer counts as discarded, not as an error.
	 */
	async function discardFormDrafts(entryId: string | null, reason: string): Promise<void> {
		const collectionId = activeCollection?._id ? String(activeCollection._id) : '';
		if (!collectionId) return;

		const resume = resumeDraft;
		const draftId = trackedDraftId ?? resume?.draft._id ?? null;
		const draftIsNew = trackedDraftIsNew || resume?.isNewEntry === true;
		// A new-entry draft is addressed by its own id: the entry id reported by a
		// fresh create/clone names the row that draft never belonged to.
		const targetEntryId = draftIsNew
			? null
			: entryId || resume?.draft.contentId || currentEntryId() || null;
		if (!targetEntryId && !draftId) return;

		const key = draftDiscardKey({ collectionId, entryId: targetEntryId, draftId });
		if (discardedDraftKeys.has(key)) return;
		discardedDraftKeys.add(key);

		trackedDraftId = null;
		trackedDraftContentId = null;
		trackedDraftIsNew = false;
		resumeDraft = null;

		const outcome = await discardEntryDrafts({
			collectionId,
			entryId: targetEntryId,
			draftId,
			discardOne: discardDraft,
			discardAll: discardDraftsForEntry
		});
		if (outcome === 'failed') {
			// Keep the draft retryable: a later commit event may delete it.
			discardedDraftKeys.delete(key);
			logger.warn(`[Draft] Could not discard drafts after ${reason}`);
		}
	}

	// Auto-save draft function. Takes the already-gated payload: the required-field
	// check and the "nothing to keep" check live in `buildAutosavePayload`, so no
	// caller of this function can skip them.
	//
	// The sink is the drafts API. It never writes the live entry and never stamps an
	// `_id` onto the form: the live row is Save's job, which is what keeps Reload on
	// an untouched Create form from producing a ghost entry.
	async function autoSaveDraft(draftData: Record<string, unknown>): Promise<boolean> {
		if (isSavingDraft) {
			return false;
		}

		const collectionId = activeCollection?._id ? String(activeCollection._id) : '';
		if (!collectionId) {
			return false;
		}

		isSavingDraft = true;
		try {
			const draft = await saveEntryDraft({
				collectionId,
				entryData: draftData,
				// A resumed new-entry draft re-upserts under its own contentId; an entry
				// form addresses the live row through `_id`.
				draftEntryId: draftData._id ? null : trackedDraftContentId,
				save: saveDraftRequest
			});
			if (!draft) {
				logger.error('[Auto-save] Failed to save draft');
				return false;
			}

			trackedDraftId = draft._id;
			trackedDraftContentId = draft.contentId || null;
			trackedDraftIsNew = isNewEntryDraft(draft);
			logger.debug('[Auto-save] Draft saved', {
				draftId: draft._id,
				entryId: draftData._id ?? null
			});
			return true;
		} finally {
			isSavingDraft = false;
		}
	}

	// Listen for cancel, save, and delete events
	$effect(() => {
		/**
		 * Events are document-scoped; only the collection this editor shows may
		 * spend a discard on them.
		 */
		const eventTargetsThisCollection = (detail?: { collectionId?: string }): boolean => {
			const collectionId = activeCollection?._id ? String(activeCollection._id) : '';
			if (!detail?.collectionId || !collectionId) return true;
			return String(detail.collectionId) === collectionId;
		};

		const handleCancelClick = (_e: Event) => {
			userClickedCancel = true;
			logger.debug('[Auto-save] Cancel clicked - no draft will be saved');
			// Cancel abandons the form's pending work, so its draft goes too.
			void discardFormDrafts(currentEntryId() || null, 'cancel');
		};

		const handleEntrySaved = (e: Event) => {
			// Update baseline to match current value, preventing unsaved changes detection
			if (collections.activeValue) {
				initialCollectionValue = JSON.stringify(collections.activeValue);
				logger.debug('[Auto-save] Entry saved manually - baseline updated');
			}
			// The committed row supersedes the draft taken from this form.
			const detail = (e as CustomEvent<{ collectionId?: string; entryId?: string } | undefined>)
				.detail;
			if (!eventTargetsThisCollection(detail)) return;
			void discardFormDrafts(
				detail?.entryId ? String(detail.entryId) : currentEntryId() || null,
				'save'
			);
		};

		const handleEntryDeleted = (e: Event) => {
			const detail = (e as CustomEvent<{ collectionId?: string; entryId?: string } | undefined>)
				.detail;
			if (!eventTargetsThisCollection(detail)) return;
			void discardFormDrafts(
				detail?.entryId ? String(detail.entryId) : currentEntryId() || null,
				'delete'
			);
		};

		document.addEventListener('cancelEdit', handleCancelClick);
		document.addEventListener('entrySaved', handleEntrySaved);
		document.addEventListener('entryDeleted', handleEntryDeleted);

		return () => {
			document.removeEventListener('cancelEdit', handleCancelClick);
			document.removeEventListener('entrySaved', handleEntrySaved);
			document.removeEventListener('entryDeleted', handleEntryDeleted);
		};
	});

	// Navigation guard: auto-save draft if changes exist
	beforeNavigate(async ({ cancel, to }) => {
		// Skip if user clicked cancel button
		if (userClickedCancel) {
			logger.debug('[Auto-save] Skipping auto-save due to cancel');
			userClickedCancel = false;
			return;
		}

		// Only check if we're in edit/create mode and have unsaved changes
		if (!['edit', 'create'].includes(collections.mode) || !collections.activeValue) {
			return;
		}

		// The guard body lives in `@utils/entry-autosave` so the leave-path
		// itself (cancel vs. skip vs. write) is unit-testable. It owns the
		// required-field gate: a form the gate rejects is never written, and it
		// keeps the user on the form (`cancel()`) instead of letting the router
		// navigate away and drop the edits they already typed.
		const outcome = await guardNavigationAutosave({
			entryData: collections.activeValue as Record<string, unknown>,
			initialSnapshot: initialCollectionValue,
			fields: (collectionSchema ?? collections.active)?.fields,
			now: nowISODateString(),
			isSaving: isSavingDraft,
			cancel,
			saveDraft: autoSaveDraft,
			notify: (level, message) => {
				if (level === 'warning') toast.warning(message);
				else if (level === 'success') toast.success(message);
				else toast.error(message);
			}
		});

		if (outcome.action === 'saved') {
			// Update initial value to prevent re-saving on the resumed navigation
			initialCollectionValue = JSON.stringify(collections.activeValue);
			collections.setMode('view');
			if (to?.url) {
				await goto(to.url.href);
			}
		} else {
			logger.debug('[Auto-save] No draft written for this navigation', outcome);
		}
	});
</script>

<svelte:head
	><title>{activeCollection?.name ?? 'Collection'} {page_title_suffix()}</title></svelte:head
>

<div class="content flex min-h-0 flex-1 flex-col">
	<!-- Auto-save indicator -->
	{#if isSavingDraft}
		<div
			class="fixed inset-e-4 top-20 z-50 flex items-center gap-2 rounded bg-warning-500 px-4 py-2 text-white shadow-lg"
		>
			<div
				class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
			></div>
			<span class="text-sm font-medium">{collection_autosaving_draft()}</span>
		</div>
	{/if}

	{#if !activeCollection}
		<!-- Collection data should be available from SSR, if not show error -->
		<div
			class="dark:bg-error-500/10 flex h-64 flex-col items-center justify-center rounded border border-error-500 bg-error-500/10 p-8"
		>
			<svg
				aria-hidden="true"
				class="mb-4 h-16 w-16 text-error-500"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
				/>
			</svg>
			<h3 class="mb-2 text-xl font-bold text-error-600 dark:text-error-500">
				{collection_not_loaded()}
			</h3>
			<p class="text-center text-error-600 dark:text-error-500">{collection_unable_to_load()}</p>
		</div>
	{:else if effectiveMode === 'view' || effectiveMode === 'modify'}
		<!-- EntryList updates in place across collections; it swaps its per-collection state itself. -->
		{@const listMetrics =
			(data?.listMetrics as {
				count: number;
				hitRate: number;
				p50Ms: number;
				p95Ms: number;
				avgMs: number;
			} | null) ?? null}
		<EntryList
			collection={activeCollection}
			{entries}
			{pagination}
			contentLanguage={serverContentLanguage}
			{statusFacets}
			{listMetrics}
		/>
	{:else if ['edit', 'create'].includes(effectiveMode)}
		{@const activeEntryId = String(collections.activeValue?._id || urlEditParam || '')}
		<div
			id="fields_container"
			class="fields flex-1 min-h-0 flex flex-col overflow-y-auto overflow-x-visible"
		>
			{#if resumeDraft}
				<div class="mb-3 shrink-0">
					<DraftResumeBanner
						updatedAt={resumeDraft.draft.updatedAt}
						isNewEntry={resumeDraft.isNewEntry}
						busy={isDraftBusy}
						onRestore={restoreResumeDraft}
						onDiscard={discardResumeDraft}
					/>
				</div>
			{/if}
			{#if effectiveMode === 'edit' && activeEntryId}
				<div class="mb-3 shrink-0">
					<WorkflowActions collectionId={activeCollection._id!} entryId={activeEntryId} />
				</div>
			{/if}
			<!-- Pass the server-loaded data directly as props -->
			<Fields
				collection={activeCollection}
				fields={activeCollection.fields}
				{revisions}
				contentLanguage={serverContentLanguage}
			/>
		</div>
	{/if}
</div>
