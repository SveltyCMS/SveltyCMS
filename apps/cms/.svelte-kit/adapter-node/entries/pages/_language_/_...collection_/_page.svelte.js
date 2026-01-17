import {
	f as attributes,
	p as props_id,
	d as escape_html,
	g as attr_class,
	a as attr,
	c as stringify,
	h as bind_props,
	e as ensure_array_like,
	b as attr_style,
	l as head
} from '../../../../chunks/index5.js';
import { logger } from '../../../../chunks/logger.js';
import '@sveltejs/kit/internal';
import '../../../../chunks/exports.js';
import '../../../../chunks/utils3.js';
import 'clsx';
import '@sveltejs/kit/internal/server';
import '../../../../chunks/state.svelte.js';
import '../../../../chunks/client.js';
import {
	e as collection,
	m as mode,
	f as setModifyEntry,
	d as setMode,
	b as setCollectionValue,
	g as collectionValue,
	c as collections
} from '../../../../chunks/collectionStore.svelte.js';
import { t as toaster, e as storeListboxValue, f as contentLanguage, g as translationProgress, a as app } from '../../../../chunks/store.svelte.js';
import { g as getFieldName, d as debounce } from '../../../../chunks/utils.js';
import { g as goto, i as invalidateAll } from '../../../../chunks/client2.js';
import { p as page } from '../../../../chunks/index6.js';
import {
	c as createClones,
	b as batchUpdateEntries,
	s as showToast,
	a as batchDeleteEntries,
	d as deleteEntry
} from '../../../../chunks/apiClient.js';
import { f as formatDisplayDate } from '../../../../chunks/dateUtils.js';
import { S as StatusTypes } from '../../../../chunks/definitions.js';
import '../../../../chunks/schemas.js';
import '../../../../chunks/runtime.js';
import {
	bg as update_failed,
	bh as button_test,
	bi as entrylist_multibutton_clone,
	bj as entrylist_multibutton_schedule,
	bk as entrylist_multibutton_unpublish,
	bl as entrylist_multibutton_publish,
	bm as button_archive,
	ae as button_delete,
	F as button_cancel,
	R as button_confirm,
	bn as error_scheduling,
	bo as entry_scheduled_status,
	bp as no_entry_for_scheduling,
	bq as error_saving_draft,
	br as changes_saved_as_draft,
	bs as stay_and_continue_editing,
	bt as save_as_draft_and_leave,
	bu as unsaved_changes_body,
	bv as unsaved_changes_title,
	bw as status_reserved_for_system,
	bx as only_admins_can_delete,
	by as entry_cloned_success,
	bz as entry_scheduled,
	bA as entry_status_updated,
	bB as entry_saved,
	bC as entry_deleted_success,
	bD as entry_archived,
	bE as no_collection_found,
	bF as no_entries_selected,
	bG as delete_failed,
	bH as entries_updated,
	bI as entries_cloned,
	bJ as entries_scheduled,
	bK as entries_deleted,
	bL as entries_set_to_test,
	bM as entries_unpublished,
	bN as entries_published,
	bO as entries_archived,
	bP as entrylist_multibutton_draft,
	bQ as entrylist_multibutton_create,
	bR as entrylist_multibutton_show_active,
	bS as entrylist_multibutton_show_archived,
	bT as entrylist_multibutton_viewing_archived,
	bU as entrylist_multibutton_viewing_active,
	bV as entrylist_multibutton_toggle_menu,
	bW as entrylist_multibutton_available_actions,
	bX as button_loading,
	bY as applayout_contentlanguage,
	bZ as translationsstatus_completed,
	ay as entrylist_dnd,
	az as entrylist_all,
	b_ as entrylist_no_collection2,
	aa as button_edit,
	b$ as applayout_version,
	c0 as fields_preview1,
	aS as form_required,
	c1 as fields_no_widgets_found1
} from '../../../../chunks/_index.js';
import { publicEnv } from '../../../../chunks/globalSettings.svelte.js';
import { s as screen } from '../../../../chunks/screenSizeStore.svelte.js';
import { u as ui } from '../../../../chunks/UIStore.svelte.js';
import { F as FloatingInput } from '../../../../chunks/floatingInput.js';
import { T as TableFilter } from '../../../../chunks/TableFilter.js';
import { T as TableIcons, h as html } from '../../../../chunks/TableIcons.js';
import { T as TablePagination } from '../../../../chunks/TablePagination.js';
import { o as onDestroy } from '../../../../chunks/index-server.js';
import { g as getLanguageName } from '../../../../chunks/languageUtils.js';
import { c as createContext, m as mergeProps, u as useMachine, n as normalizeProps } from '../../../../chunks/machine.svelte.js';
import { machine, connect, splitProps } from '@zag-js/progress';
import { M as Menu } from '../../../../chunks/anatomy4.js';
import { P as Portal } from '../../../../chunks/anatomy.js';
import { a as showDeleteConfirm, b as showStatusChangeConfirm } from '../../../../chunks/modalUtils.js';
import '../../../../chunks/index7.js';
import '../../../../chunks/widgetStore.svelte.js';
import { T as Tabs } from '../../../../chunks/anatomy3.js';
const RootContext = createContext();
function Circle_range($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const progress = RootContext.consume();
		const { element, ...rest } = props;
		const attributes$1 = mergeProps(progress().getCircleRangeProps(), { 'stroke-linecap': 'round' }, rest);
		if (element) {
			$$renderer2.push('<!--[-->');
			element($$renderer2, attributes$1);
			$$renderer2.push(`<!---->`);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`<circle${attributes({ ...attributes$1 }, void 0, void 0, void 0, 3)}></circle>`);
		}
		$$renderer2.push(`<!--]-->`);
	});
}
function Circle_track($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const progress = RootContext.consume();
		const { element, ...rest } = props;
		const attributes$1 = mergeProps(progress().getCircleTrackProps(), rest);
		if (element) {
			$$renderer2.push('<!--[-->');
			element($$renderer2, attributes$1);
			$$renderer2.push(`<!---->`);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`<circle${attributes({ ...attributes$1 }, void 0, void 0, void 0, 3)}></circle>`);
		}
		$$renderer2.push(`<!--]-->`);
	});
}
function Circle($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const progress = RootContext.consume();
		const { element, children, ...rest } = props;
		const attributes$1 = mergeProps(progress().getCircleProps(), rest);
		if (element) {
			$$renderer2.push('<!--[-->');
			element($$renderer2, attributes$1);
			$$renderer2.push(`<!---->`);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`<svg${attributes({ ...attributes$1 }, void 0, void 0, void 0, 3)}>`);
			children?.($$renderer2);
			$$renderer2.push(`<!----></svg>`);
		}
		$$renderer2.push(`<!--]-->`);
	});
}
function Label($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const progress = RootContext.consume();
		const { element, children, ...rest } = props;
		const attributes$1 = mergeProps(progress().getLabelProps(), rest);
		if (element) {
			$$renderer2.push('<!--[-->');
			element($$renderer2, attributes$1);
			$$renderer2.push(`<!---->`);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`<div${attributes({ ...attributes$1 })}>`);
			children?.($$renderer2);
			$$renderer2.push(`<!----></div>`);
		}
		$$renderer2.push(`<!--]-->`);
	});
}
function Range($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const progress = RootContext.consume();
		const { element, children, ...rest } = props;
		const attributes$1 = mergeProps(progress().getRangeProps(), rest);
		if (element) {
			$$renderer2.push('<!--[-->');
			element($$renderer2, attributes$1);
			$$renderer2.push(`<!---->`);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`<div${attributes({ ...attributes$1 })}>`);
			children?.($$renderer2);
			$$renderer2.push(`<!----></div>`);
		}
		$$renderer2.push(`<!--]-->`);
	});
}
function Root_context($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const progress = RootContext.consume();
		const { children } = props;
		children($$renderer2, progress);
		$$renderer2.push(`<!---->`);
	});
}
function Root_provider($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const { element, children, value: avatar, ...rest } = props;
		const attributes$1 = mergeProps(avatar().getRootProps(), rest);
		RootContext.provide(() => avatar());
		if (element) {
			$$renderer2.push('<!--[-->');
			element($$renderer2, attributes$1);
			$$renderer2.push(`<!---->`);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`<div${attributes({ ...attributes$1 })}>`);
			children?.($$renderer2);
			$$renderer2.push(`<!----></div>`);
		}
		$$renderer2.push(`<!--]-->`);
	});
}
function useProgress(props) {
	const service = useMachine(machine, props);
	const progress = connect(service, normalizeProps);
	return () => progress;
}
function Root($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const id = props_id($$renderer2);
		const { $$slots, $$events, ...props } = $$props;
		const [progressProps, componentProps] = splitProps(props);
		const { element, children, ...rest } = componentProps;
		const avatar = useProgress(() => ({ ...progressProps, id }));
		const attributes$1 = mergeProps(avatar().getRootProps(), rest);
		RootContext.provide(() => avatar());
		if (element) {
			$$renderer2.push('<!--[-->');
			element($$renderer2, attributes$1);
			$$renderer2.push(`<!---->`);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`<div${attributes({ ...attributes$1 })}>`);
			children?.($$renderer2);
			$$renderer2.push(`<!----></div>`);
		}
		$$renderer2.push(`<!--]-->`);
	});
}
function Track($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const progress = RootContext.consume();
		const { element, children, ...rest } = props;
		const attributes$1 = mergeProps(progress().getTrackProps(), rest);
		if (element) {
			$$renderer2.push('<!--[-->');
			element($$renderer2, attributes$1);
			$$renderer2.push(`<!---->`);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`<div${attributes({ ...attributes$1 })}>`);
			children?.($$renderer2);
			$$renderer2.push(`<!----></div>`);
		}
		$$renderer2.push(`<!--]-->`);
	});
}
function Value_text($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const progress = RootContext.consume();
		const { element, children, ...rest } = props;
		const attributes$1 = mergeProps(progress().getValueTextProps(), rest);
		if (element) {
			$$renderer2.push('<!--[-->');
			element($$renderer2, attributes$1);
			$$renderer2.push(`<!---->`);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`<span${attributes({ ...attributes$1 })}>`);
			if (children) {
				$$renderer2.push('<!--[-->');
				children?.($$renderer2);
				$$renderer2.push(`<!---->`);
			} else {
				$$renderer2.push('<!--[!-->');
				$$renderer2.push(`${escape_html(progress().percentAsString)}`);
			}
			$$renderer2.push(`<!--]--></span>`);
		}
		$$renderer2.push(`<!--]-->`);
	});
}
const Progress = Object.assign(Root, {
	Provider: Root_provider,
	Context: Root_context,
	Label,
	ValueText: Value_text,
	Track,
	Range,
	Circle,
	CircleTrack: Circle_track,
	CircleRange: Circle_range
});
const entryMessages = {
	// Status update messages
	entriesArchived: (count) => entries_archived?.({}) || `${count} ${count === 1 ? 'entry' : 'entries'} archived successfully`,
	entriesPublished: (count) => entries_published?.({}) || `${count} ${count === 1 ? 'entry' : 'entries'} published successfully`,
	entriesUnpublished: (count) => entries_unpublished?.({}) || `${count} ${count === 1 ? 'entry' : 'entries'} unpublished successfully`,
	entriesSetToTest: (count) => entries_set_to_test?.({}) || `${count} ${count === 1 ? 'entry' : 'entries'} set to test successfully`,
	entriesDeleted: (count) => entries_deleted?.({}) || `${count} ${count === 1 ? 'entry' : 'entries'} deleted successfully`,
	entriesScheduled: (count) => entries_scheduled?.({}) || `${count} ${count === 1 ? 'entry' : 'entries'} scheduled successfully`,
	entriesCloned: (count) => entries_cloned?.({}) || `${count} ${count === 1 ? 'entry' : 'entries'} cloned successfully`,
	entriesUpdated: (count, status) => entries_updated?.({}) || `${count} ${count === 1 ? 'entry' : 'entries'} updated to ${status}`,
	// Error messages
	updateFailed: (operation) => update_failed?.({}) || `Failed to ${operation} entries`,
	deleteFailed: (operation) => delete_failed?.({}) || `Failed to ${operation} entries`,
	noEntriesSelected: () => no_entries_selected?.() || 'No entries selected',
	noCollectionFound: () => no_collection_found?.() || 'Collection not found',
	// Single entry messages
	entryArchived: () => entry_archived?.() || 'Entry archived successfully',
	entryDeleted: () => entry_deleted_success?.() || 'Entry deleted successfully',
	entrySaved: () => entry_saved?.() || 'Entry saved successfully',
	entryStatusUpdated: (status) => entry_status_updated?.({ status }) || `Entry status updated to ${status}`,
	entryScheduled: (date) => entry_scheduled?.({}) || `Entry scheduled for ${date}`,
	entryCloned: () => entry_cloned_success?.() || 'Entry cloned successfully',
	// Admin permissions
	onlyAdminsCanDelete: () => only_admins_can_delete?.() || 'Only administrators can delete archived entries',
	statusReservedForSystem: (status) => status_reserved_for_system?.({}) || `${status} status is reserved for system operations`,
	// Unsaved changes
	unsavedChangesTitle: () => unsaved_changes_title?.() || 'Unsaved Changes',
	unsavedChangesBody: () => unsaved_changes_body?.() || 'You have unsaved changes. Do you want to save them as a draft before leaving?',
	saveAsDraftAndLeave: () => save_as_draft_and_leave?.() || 'Save as Draft and Leave',
	stayAndContinueEditing: () => stay_and_continue_editing?.() || 'Stay and Continue Editing',
	changesSavedAsDraft: () => changes_saved_as_draft?.() || 'Changes saved as draft',
	errorSavingDraft: (error) => error_saving_draft?.({}) || `Error saving draft: ${error}`,
	// Scheduling
	noEntryForScheduling: () => no_entry_for_scheduling?.() || 'No entry selected for scheduling',
	entryScheduledStatus: () => entry_scheduled_status?.() || 'Entry status changed to scheduled',
	errorScheduling: (error) => error_scheduling?.({}) || `Error scheduling entry: ${error}`,
	// Common actions
	confirm: () => button_confirm?.() || 'Confirm',
	cancel: () => button_cancel?.() || 'Cancel',
	delete: () => button_delete?.() || 'Delete',
	archive: () => button_archive?.() || 'Archive',
	publish: () => entrylist_multibutton_publish?.() || 'Publish',
	unpublish: () => entrylist_multibutton_unpublish?.() || 'Unpublish',
	schedule: () => entrylist_multibutton_schedule?.() || 'Schedule',
	clone: () => entrylist_multibutton_clone?.() || 'Clone',
	test: () => button_test?.() || 'Test'
};
async function setEntriesStatus(entryIds, status, onSuccess, payload = {}) {
	if (!entryIds.length) return;
	const collId = collection.value?._id;
	if (!collId) return;
	const result = await batchUpdateEntries(collId, { ids: entryIds, status, ...payload });
	if (result.success) {
		const count = entryIds.length;
		let message;
		switch (status) {
			case StatusTypes.archive:
				message = entryMessages.entriesArchived(count);
				break;
			case StatusTypes.publish:
				message = entryMessages.entriesPublished(count);
				break;
			case StatusTypes.unpublish:
				message = entryMessages.entriesUnpublished(count);
				break;
			case StatusTypes.draft:
				message = entryMessages.entriesUpdated(count, StatusTypes.draft);
				break;
			default:
				message = entryMessages.entriesUpdated(count, status);
		}
		toaster.success({ description: message });
		onSuccess();
	} else {
		toaster.error({ description: result.error || entryMessages.updateFailed('update') });
	}
}
async function cloneEntries(rawEntries, onSuccess) {
	if (!rawEntries.length) return;
	const collId = collection.value?._id;
	if (!collId) return;
	const entriesToClone = rawEntries.map((entry) => {
		const { _id, createdAt, updatedAt, ...rest } = entry;
		return { ...rest, clonedFrom: _id };
	});
	const result = await createClones(collId, entriesToClone);
	if (result.success) {
		toaster.success({ description: 'Entries cloned' });
		onSuccess();
	} else {
		toaster.error({ description: result.error || 'Failed to clone entries' });
	}
}
const browser = typeof window !== 'undefined';
function reflectModeInURL(mode2, entryId, options = {}) {
	if (!browser) return;
	const url = new URL(window.location.href);
	url.searchParams.delete('edit');
	url.searchParams.delete('create');
	if (mode2 === 'edit' && entryId) {
		url.searchParams.set('edit', entryId);
	} else if (mode2 === 'create') {
		url.searchParams.set('create', 'true');
	}
	const method = options.replaceState ? 'replaceState' : 'pushState';
	window.history[method]({}, '', url.toString());
	logger.debug(`[URL] ${mode2}${entryId ? ` (${entryId.substring(0, 8)})` : ''}`);
}
function Status($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { value } = $$props;
		$$renderer2.push(
			`<div${attr_class(`flex w-fit min-w-24 items-center justify-center gap-2 rounded px-3 py-1.5 text-center text-white ${stringify(value === StatusTypes.publish ? 'gradient-primary' : value === StatusTypes.unpublish ? 'gradient-yellow' : value === StatusTypes.schedule ? 'gradient-pink' : value === StatusTypes.delete ? 'bg-surface-500 text-white' : value === StatusTypes.clone ? 'gradient-secondary' : value === StatusTypes.draft ? 'preset-outlined-surface-500 text-surface-900-50-token' : value === StatusTypes.archive ? 'bg-surface-600 text-white' : 'badge')}`)}${attr('title', `Status: ${value}`)}>`
		);
		if (value === StatusTypes.publish) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<iconify-icon icon="bi:hand-thumbs-up-fill" width="16"></iconify-icon> <p class="hidden sm:block text-xs font-bold uppercase">${escape_html(entrylist_multibutton_publish())}</p>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
			if (value === StatusTypes.unpublish) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(
					`<iconify-icon icon="bi:pause-circle" width="16"></iconify-icon> <p class="hidden sm:block text-xs font-bold uppercase">${escape_html(entrylist_multibutton_unpublish())}</p>`
				);
			} else {
				$$renderer2.push('<!--[!-->');
				if (value === StatusTypes.schedule) {
					$$renderer2.push('<!--[-->');
					$$renderer2.push(
						`<iconify-icon icon="bi:clock" width="16"></iconify-icon> <p class="hidden sm:block text-xs font-bold uppercase">${escape_html(entrylist_multibutton_schedule())}</p>`
					);
				} else {
					$$renderer2.push('<!--[!-->');
					if (value === 'deleted') {
						$$renderer2.push('<!--[-->');
						$$renderer2.push(
							`<iconify-icon icon="bi:trash3-fill" width="16"></iconify-icon> <p class="hidden sm:block text-xs font-bold uppercase">${escape_html(button_delete())}</p>`
						);
					} else {
						$$renderer2.push('<!--[!-->');
						if (value === StatusTypes.delete) {
							$$renderer2.push('<!--[-->');
							$$renderer2.push(
								`<iconify-icon icon="bi:trash3-fill" width="16"></iconify-icon> <p class="hidden sm:block text-xs font-bold uppercase">${escape_html(button_delete())}</p>`
							);
						} else {
							$$renderer2.push('<!--[!-->');
							if (value === StatusTypes.clone) {
								$$renderer2.push('<!--[-->');
								$$renderer2.push(
									`<iconify-icon icon="bi:clipboard-data-fill" width="16"></iconify-icon> <p class="hidden sm:block text-xs font-bold uppercase">${escape_html(entrylist_multibutton_clone())}</p>`
								);
							} else {
								$$renderer2.push('<!--[!-->');
								if (value === StatusTypes.draft) {
									$$renderer2.push('<!--[-->');
									$$renderer2.push(
										`<iconify-icon icon="bi:pencil-square" width="16"></iconify-icon> <p class="hidden sm:block text-xs font-bold uppercase">${escape_html(entrylist_multibutton_draft())}</p>`
									);
								} else {
									$$renderer2.push('<!--[!-->');
									if (value === StatusTypes.archive) {
										$$renderer2.push('<!--[-->');
										$$renderer2.push(
											`<iconify-icon icon="bi:archive-fill" width="16"></iconify-icon> <p class="hidden sm:block text-xs font-bold uppercase">${escape_html(button_archive())}</p>`
										);
									} else {
										$$renderer2.push('<!--[!-->');
										$$renderer2.push(`<p class="px-2">${escape_html(value)}</p>`);
									}
									$$renderer2.push(`<!--]-->`);
								}
								$$renderer2.push(`<!--]-->`);
							}
							$$renderer2.push(`<!--]-->`);
						}
						$$renderer2.push(`<!--]-->`);
					}
					$$renderer2.push(`<!--]-->`);
				}
				$$renderer2.push(`<!--]-->`);
			}
			$$renderer2.push(`<!--]-->`);
		}
		$$renderer2.push(`<!--]--></div>`);
	});
}
function EntryList_MultiButton($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let {
			isCollectionEmpty = false,
			hasSelections = false,
			selectedCount = 0,
			selectedItems = [],
			showDeleted = false,
			publish,
			unpublish,
			draft,
			schedule,
			delete: deleteAction,
			clone,
			create
		} = $$props;
		const ACTION_CONFIGS = [
			{
				type: 'create',
				label: entrylist_multibutton_create(),
				gradient: 'gradient-tertiary',
				icon: 'ic:round-plus',
				textColor: 'text-white',
				shortcut: 'Alt+N',
				shortcutKey: 'n',
				requiresSelection: false,
				dangerLevel: 'low'
			},
			{
				type: 'publish',
				label: entrylist_multibutton_publish(),
				gradient: 'gradient-primary',
				icon: 'bi:hand-thumbs-up-fill',
				textColor: 'text-white',
				shortcut: 'Alt+P',
				shortcutKey: 'p',
				requiresSelection: true,
				dangerLevel: 'medium'
			},
			{
				type: 'unpublish',
				label: entrylist_multibutton_unpublish(),
				gradient: 'gradient-warning',
				icon: 'bi:pause-circle',
				textColor: 'text-black',
				shortcut: 'Alt+U',
				shortcutKey: 'u',
				requiresSelection: true,
				dangerLevel: 'medium'
			},
			{
				type: 'draft',
				label: 'Draft',
				gradient: 'gradient-secondary',
				icon: 'ic:baseline-edit-note',
				textColor: 'text-white',
				shortcut: 'Alt+D',
				shortcutKey: 'd',
				requiresSelection: true,
				dangerLevel: 'low'
			},
			{
				type: 'schedule',
				label: entrylist_multibutton_schedule(),
				gradient: 'gradient-tertiary',
				icon: 'ic:round-schedule',
				textColor: 'text-white',
				requiresSelection: true,
				dangerLevel: 'low'
			},
			{
				type: 'clone',
				label: entrylist_multibutton_clone(),
				gradient: 'gradient-secondary',
				icon: 'ic:round-content-copy',
				textColor: 'text-white',
				requiresSelection: true,
				dangerLevel: 'low'
			},
			{
				type: 'delete',
				label: button_delete(),
				gradient: 'gradient-error',
				icon: 'ic:round-delete-forever',
				textColor: 'text-white',
				shortcut: 'Alt+Del',
				shortcutKey: 'Delete',
				requiresSelection: true,
				dangerLevel: 'high'
			}
		];
		let isDropdownOpen = false;
		let hoveredAction = null;
		let isProcessing = false;
		let focusedIndex = 0;
		let menuItemRefs = [];
		const currentAction = storeListboxValue.value || 'create';
		const currentConfig = (() => {
			const config = ACTION_CONFIGS.find((c) => c.type === currentAction);
			return config || ACTION_CONFIGS[0];
		})();
		const stats = (() => {
			const items = selectedItems || [];
			const published = items.filter((i) => i.status === StatusTypes.publish).length;
			const drafts = items.filter((i) => (i.status || i.raw_status) === StatusTypes.draft).length;
			return { published, drafts, total: items.length };
		})();
		const dynamicLabel = (() => {
			if (isProcessing) {
				return `${button_loading()}...`;
			}
			if (selectedCount < 2 || currentAction === 'create') {
				return currentConfig.label;
			}
			return `Bulk ${currentConfig.label} (${selectedCount})`;
		})();
		const availableActions = (() => {
			return ACTION_CONFIGS.filter((config) => {
				if (config.type === currentAction) return false;
				if (config.type === 'create') return false;
				if (hasSelections) {
					if (config.type === 'publish' && stats.published === selectedCount) return false;
					if (config.type === 'unpublish' && stats.drafts === selectedCount && stats.published === 0) return false;
					if (config.type === 'draft' && stats.drafts === selectedCount) return false;
				}
				return true;
			});
		})();
		function handleKeyDown(e) {
			if (isDropdownOpen) {
				switch (e.key) {
					case 'Escape':
						e.preventDefault();
						isDropdownOpen = false;
						return;
					case 'ArrowDown':
						e.preventDefault();
						focusedIndex = Math.min(focusedIndex + 1, availableActions.length - 1);
						menuItemRefs[focusedIndex]?.focus();
						return;
					case 'ArrowUp':
						e.preventDefault();
						focusedIndex = Math.max(focusedIndex - 1, 0);
						menuItemRefs[focusedIndex]?.focus();
						return;
					case 'Home':
						e.preventDefault();
						focusedIndex = 0;
						return;
					case 'End':
						e.preventDefault();
						focusedIndex = availableActions.length - 1;
						menuItemRefs[focusedIndex]?.focus();
						return;
					case 'Enter':
					case ' ':
						e.preventDefault();
						const action = availableActions[focusedIndex];
						if (action && !(action.requiresSelection && !hasSelections)) {
							handleAction(action.type);
						}
						return;
				}
			}
			if (!e.altKey) return;
			const matchedConfig = ACTION_CONFIGS.find((config) => {
				if (!config.shortcutKey) return false;
				return e.key.toLowerCase() === config.shortcutKey.toLowerCase() || e.key === config.shortcutKey;
			});
			if (matchedConfig) {
				e.preventDefault();
				if (matchedConfig.requiresSelection && !hasSelections) {
					logger.debug(`[MultiButton] Keyboard shortcut ${matchedConfig.shortcut} requires selection`);
					return;
				}
				handleAction(matchedConfig.type);
			}
		}
		onDestroy(() => {
			window.removeEventListener('keydown', handleKeyDown);
		});
		async function handleAction(action) {
			isDropdownOpen = false;
			await executeAction(action);
		}
		async function executeAction(action) {
			isProcessing = true;
			try {
				switch (action) {
					case 'create':
						create();
						break;
					case 'publish':
						await publish();
						break;
					case 'unpublish':
						await unpublish();
						break;
					case 'draft':
						await draft();
						break;
					case 'clone':
						await clone();
						break;
					case 'delete':
						await deleteAction(showDeleted);
						break;
					case 'schedule':
						const now = /* @__PURE__ */ new Date().toISOString();
						schedule(now, 'publish');
						break;
				}
			} catch (error) {
				const errMsg = error.message;
				showToast(errMsg, 'error');
				logger.error(`[MultiButton] Action ${action} failed:`, error);
			} finally {
				isProcessing = false;
			}
		}
		$$renderer2.push(
			`<div class="relative flex items-center"><div class="flex items-center gap-0"><button type="button"${attr_class(`mt-1 btn rounded-full mr-2 transition-all duration-200 active:scale-90 ${stringify(!showDeleted ? 'preset-outlined-surface-500 ' : 'preset-filled-error-500 text-white ring-2 ring-error-500 animate-pulse')}`)}${attr('title', showDeleted ? entrylist_multibutton_show_active() : entrylist_multibutton_show_archived())}${attr('aria-label', showDeleted ? entrylist_multibutton_viewing_archived() : entrylist_multibutton_viewing_active())}${attr('aria-pressed', showDeleted)}><iconify-icon${attr('icon', showDeleted ? 'ic:round-archive' : 'ic:round-unarchive')} width="24"></iconify-icon></button>  <div${attr_class(`group/main relative flex items-center shadow-xl overflow-visible transition-all duration-200 ${stringify(!hasSelections ? 'active:scale-95 cursor-pointer' : '')} rounded-l-full rounded-r-md border border-white/20`)}><button type="button"${attr('disabled', isProcessing, true)}${attr_class(`h-[40px] min-w-[60px] md:min-w-[140px] rtl:rotate-180 font-bold transition-all duration-200 ${stringify(hasSelections ? 'active:scale-95' : 'pointer-events-none')} ${stringify(currentConfig.gradient)} ${stringify(currentConfig.textColor)} rounded-l-full rounded-r-none px-6 flex items-center gap-2 border-r border-white disabled:opacity-50 disabled:cursor-not-allowed`, 'svelte-1wwz954')}${attr('aria-label', dynamicLabel)}${attr('aria-busy', isProcessing)}>`
		);
		if (isProcessing) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(`<iconify-icon icon="svg-spinners:ring-resize" width="24" class="animate-spin"></iconify-icon>`);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`<iconify-icon${attr('icon', currentConfig.icon)} width="24"></iconify-icon>`);
		}
		$$renderer2.push(`<!--]--> <span class="hidden md:inline-block">${escape_html(dynamicLabel)}</span></button> `);
		if (hasSelections && selectedCount > 0) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<span class="absolute left-0.5 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-surface-500 text-xs font-bold text-white animate-pulse shadow-lg">${escape_html(selectedCount)}</span>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--> `);
		if (!isCollectionEmpty) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<button type="button"${attr('disabled', !hasSelections || isProcessing, true)}${attr_class(
					`h-[40px] w-[32px] border-l border-white/20 transition-all duration-200 text-white flex items-center justify-center shadow-inner ${stringify(hasSelections && !isProcessing ? 'bg-surface-500 hover:bg-surface-400 active:scale-95 cursor-pointer' : currentConfig.gradient + ' pointer-events-none opacity-90')}`,
					'svelte-1wwz954'
				)} aria-haspopup="menu"${attr('aria-expanded', isDropdownOpen)}${attr('aria-label', entrylist_multibutton_toggle_menu())}>`
			);
			if (hasSelections) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(
					`<iconify-icon icon="ic:round-keyboard-arrow-down" width="20"${attr_class(`transition-transform duration-200 ${stringify(isDropdownOpen ? 'rotate-180' : '')}`)}></iconify-icon>`
				);
			} else {
				$$renderer2.push('<!--[!-->');
			}
			$$renderer2.push(`<!--]--></button>`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--> `);
		if (isDropdownOpen) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<div class="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl bg-surface-800 shadow-2xl ring-1 ring-black/20 backdrop-blur-md" role="menu"${attr('aria-label', entrylist_multibutton_available_actions())}><ul class="flex flex-col"><!--[-->`
			);
			const each_array = ensure_array_like(availableActions);
			for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
				let config = each_array[$$index];
				$$renderer2.push(
					`<li class="border-b border-black/10 last:border-0 relative" role="none"><button type="button" role="menuitem" class="group/item relative flex w-full items-center gap-3 px-4 py-3 text-left text-white transition-all duration-200"${attr('aria-label', `${stringify(config.label)} ${stringify(config.shortcut ? `(${config.shortcut})` : '')}`)}><div${attr_class(`absolute inset-0 ${stringify(config.gradient)} opacity-0 transition-opacity duration-200 group-hover/item:opacity-100`, 'svelte-1wwz954')}></div> <div class="relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-surface-700 transition-transform group-hover/item:scale-110"><iconify-icon${attr('icon', config.icon)} width="18"></iconify-icon></div> <div class="relative z-10 flex-1"><div class="font-semibold">${escape_html(config.label)}</div> `
				);
				if (config.shortcut) {
					$$renderer2.push('<!--[-->');
					$$renderer2.push(`<div class="text-xs text-surface-400">${escape_html(config.shortcut)}</div>`);
				} else {
					$$renderer2.push('<!--[!-->');
				}
				$$renderer2.push(`<!--]--></div> `);
				if (hoveredAction === config.type) {
					$$renderer2.push('<!--[-->');
					$$renderer2.push(`<iconify-icon icon="mdi:chevron-right" width="18" class="relative z-10 text-white"></iconify-icon>`);
				} else {
					$$renderer2.push('<!--[!-->');
				}
				$$renderer2.push(`<!--]--> `);
				if (config.dangerLevel === 'high') {
					$$renderer2.push('<!--[-->');
					$$renderer2.push(`<span class="relative z-10 rounded bg-error-500/30 px-1.5 py-0.5 text-xs font-bold text-error-300">⚠️</span>`);
				} else {
					$$renderer2.push('<!--[!-->');
				}
				$$renderer2.push(`<!--]--></button></li>`);
			}
			$$renderer2.push(`<!--]--></ul></div>`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--></div></div></div>`);
		bind_props($$props, { showDeleted });
	});
}
function TranslationStatus($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let completionTotals = { total: 0 };
		const availableLanguages = (() => {
			const languages = publicEnv?.AVAILABLE_CONTENT_LANGUAGES;
			if (!languages || !Array.isArray(languages)) {
				return ['en'];
			}
			return languages;
		})();
		const currentLanguage = contentLanguage.value;
		const currentMode = mode.value;
		const isViewMode = currentMode === 'view';
		const dropdownLanguages = (() => {
			if (isViewMode) {
				return availableLanguages.filter((l) => l !== currentLanguage);
			}
			return availableLanguages;
		})();
		const overallPercentage = /* @__PURE__ */ (() => {
			return 0;
		})();
		const showProgress = translationProgress.value?.show || completionTotals.total > 0;
		const languageProgress = (() => {
			const progress = {};
			const currentProgress = translationProgress.value;
			for (const lang of availableLanguages) {
				const langProgress = currentProgress?.[lang];
				if (langProgress && langProgress.total.size > 0) {
					progress[lang] = Math.round((langProgress.translated.size / langProgress.total.size) * 100);
				} else {
					progress[lang] = 0;
				}
			}
			return progress;
		})();
		function getProgressColor(value) {
			return 'bg-error-500';
		}
		function getTextColor(value) {
			return getProgressColor().replace('bg-', 'text-');
		}
		function handleLanguageChange(selectedLanguage) {
			logger.debug('[TranslationStatus] Language change:', contentLanguage.value, '→', selectedLanguage);
			contentLanguage.set(selectedLanguage);
			if (isViewMode) {
				const currentCollectionId = collection.value?._id;
				const currentSearch = page.url.search;
				if (currentCollectionId) {
					const newPath = `/${selectedLanguage}/${currentCollectionId}${currentSearch}`;
					goto(newPath, {});
				} else {
					const currentPath = page.url.pathname;
					const pathParts = currentPath.split('/').filter(Boolean);
					if (pathParts.length > 0) {
						pathParts[0] = selectedLanguage;
						const newPath = '/' + pathParts.join('/') + currentSearch;
						goto(newPath, {});
					}
				}
				return;
			}
			if (typeof window !== 'undefined') {
				const currentPath = window.location.pathname;
				const pathParts = currentPath.split('/').filter(Boolean);
				if (pathParts.length > 0) {
					pathParts[0] = selectedLanguage;
					const newPath = '/' + pathParts.join('/') + window.location.search;
					window.history.replaceState({}, '', newPath);
					logger.debug('[TranslationStatus] Updated URL to:', newPath);
				}
				const customEvent = new CustomEvent('languageChanged', { detail: { language: selectedLanguage }, bubbles: true });
				window.dispatchEvent(customEvent);
				logger.debug('[TranslationStatus] Dispatched languageChanged event');
			}
		}
		$$renderer2.push(`<div class="translation-status-container relative mt-1 inline-block text-left">`);
		Menu($$renderer2, {
			children: ($$renderer3) => {
				$$renderer3.push(`<!---->`);
				Menu.Trigger($$renderer3, {
					class: 'btn preset-outlined-surface-500 rounded-full flex w-full items-center gap-1 p-1.5 transition-all duration-200 hover:scale-105',
					'aria-label': 'Toggle language menu',
					children: ($$renderer4) => {
						$$renderer4.push(
							`<span class="font-medium md:hidden">${escape_html(currentLanguage.toUpperCase())}</span> <span class="font-medium hidden md:inline">${escape_html(getLanguageName(currentLanguage))}</span> <iconify-icon icon="mdi:chevron-down" class="h-5 w-5 transition-transform duration-200" aria-hidden="true"></iconify-icon>`
						);
					},
					$$slots: { default: true }
				});
				$$renderer3.push(`<!----> `);
				Portal($$renderer3, {
					children: ($$renderer4) => {
						$$renderer4.push(`<!---->`);
						Menu.Positioner($$renderer4, {
							children: ($$renderer5) => {
								$$renderer5.push(`<!---->`);
								Menu.Content($$renderer5, {
									class: `card p-2 shadow-xl preset-filled-surface-100-900 z-9999 border border-surface-200 dark:border-surface-500 ${stringify(showProgress && !isViewMode ? 'w-72' : 'w-56')}`,
									children: ($$renderer6) => {
										$$renderer6.push(
											`<div class="px-3 py-2 text-xs font-bold text-tertiary-500 dark:text-primary-500 uppercase tracking-wider text-center border-b border-surface-200 dark:border-surface-50 mb-1">${escape_html(applayout_contentlanguage())}</div> <!--[-->`
										);
										const each_array = ensure_array_like(dropdownLanguages);
										for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
											let lang = each_array[$$index];
											const percentage = languageProgress[lang] || 0;
											const isActive = currentLanguage === lang;
											$$renderer6.push(`<!---->`);
											Menu.Item($$renderer6, {
												value: lang,
												onclick: () => handleLanguageChange(lang),
												class: isActive ? 'bg-primary-500/20' : '',
												children: ($$renderer7) => {
													$$renderer7.push(
														`<div class="flex w-full items-center justify-between gap-2"><span${attr_class(`font-medium transition-colors duration-200 ${stringify(isActive ? 'text-primary-700 dark:text-primary-300' : '')}`)}><span class="md:hidden">${escape_html(lang.toUpperCase())}</span> <span class="hidden md:inline">${escape_html(getLanguageName(lang))}</span></span> <div class="flex items-center gap-2">`
													);
													if (!isViewMode && showProgress && translationProgress.value?.[lang]) {
														$$renderer7.push('<!--[-->');
														$$renderer7.push(`<div class="flex w-32 items-center gap-2"><div class="flex-1">`);
														Progress($$renderer7, {
															class: 'transition-all duration-300',
															value: percentage,
															'aria-hidden': 'true'
														});
														$$renderer7.push(
															`<!----></div> <span class="min-w-8 text-right text-sm font-semibold">${escape_html(percentage)}%</span></div>`
														);
													} else {
														$$renderer7.push('<!--[!-->');
														$$renderer7.push(
															`<span class="hidden text-xs font-normal text-tertiary-500 dark:text-primary-500 md:inline">${escape_html(lang.toUpperCase())}</span>`
														);
													}
													$$renderer7.push(`<!--]--> `);
													if (isActive) {
														$$renderer7.push('<!--[-->');
														$$renderer7.push(`<span class="text-xs" aria-label="Current language">●</span>`);
													} else {
														$$renderer7.push('<!--[!-->');
													}
													$$renderer7.push(`<!--]--></div></div>`);
												},
												$$slots: { default: true }
											});
											$$renderer6.push(`<!---->`);
										}
										$$renderer6.push(`<!--]--> `);
										if (!isViewMode && showProgress) {
											$$renderer6.push('<!--[-->');
											$$renderer6.push(`<!---->`);
											Menu.Separator($$renderer6, {});
											$$renderer6.push(
												`<!----> <div class="px-4 py-2"><div class="mb-1 text-center text-xs font-medium text-tertiary-500 dark:text-primary-500">${escape_html(translationsstatus_completed())}</div> <div class="flex items-center justify-between gap-3">`
											);
											{
												$$renderer6.push('<!--[!-->');
											}
											$$renderer6.push(
												`<!--]--> <span${attr_class(`min-w-10 text-right text-sm font-bold ${stringify(getTextColor())}`)}>${escape_html(overallPercentage)}%</span></div></div>`
											);
										} else {
											$$renderer6.push('<!--[!-->');
										}
										$$renderer6.push(`<!--]-->`);
									},
									$$slots: { default: true }
								});
								$$renderer5.push(`<!---->`);
							},
							$$slots: { default: true }
						});
						$$renderer4.push(`<!---->`);
					},
					$$slots: { default: true }
				});
				$$renderer3.push(`<!---->`);
			},
			$$slots: { default: true }
		});
		$$renderer2.push(`<!----> <div class="mt-0.5 transition-all duration-300"></div></div>`);
	});
}
function EntryList($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const {
			entries: serverEntries = [],
			pagination: serverPagination = { currentPage: 1, pageSize: 10, totalItems: 0, pagesCount: 1 },
			contentLanguage: propContentLanguage,
			breadcrumb = [],
			collectionStats = null
		} = $$props;
		const tableData = serverEntries;
		const pagesCount = serverPagination.pagesCount;
		const totalItems = serverPagination.totalItems;
		function updateURL(updates) {
			const newUrl = new URL(page.url);
			Object.entries(updates).forEach(([key, value]) => {
				if (value === null || value === '') {
					newUrl.searchParams.delete(key);
				} else {
					newUrl.searchParams.set(key, String(value));
				}
			});
			goto(newUrl, {});
		}
		function onUpdatePage(newPage) {
			entryListPaginationSettings.currentPage = newPage;
			updateURL({ page: newPage });
		}
		function onUpdateRowsPerPage(rows) {
			entryListPaginationSettings.rowsPerPage = rows;
			entryListPaginationSettings.currentPage = 1;
			updateURL({ page: 1, pageSize: rows });
		}
		const filterDebounce = debounce(500);
		function onFilterChange(filterName, value) {
			filterDebounce(() => {
				const newFilters = { ...entryListPaginationSettings.filters };
				if (value) {
					newFilters[filterName] = value;
				} else {
					delete newFilters[filterName];
				}
				entryListPaginationSettings.filters = newFilters;
				const filterUpdates = {};
				Object.entries(newFilters).forEach(([key, val]) => {
					filterUpdates[`filter_${key}`] = val || null;
				});
				filterUpdates.page = '1';
				updateURL(filterUpdates);
			});
		}
		async function onActionSuccess() {
			Object.keys(selectedMap).forEach((key) => delete selectedMap[key]);
			SelectAll = false;
			await invalidateAll();
		}
		let SelectAll = false;
		const selectedMap = {};
		const defaultPaginationSettings = (collectionId) => ({
			collectionId,
			density: 'normal',
			sorting: { sortedBy: '', isSorted: 0 },
			currentPage: 1,
			rowsPerPage: 10,
			filters: {},
			// Will be populated by an effect based on tableHeaders
			displayTableHeaders: []
		});
		let entryListPaginationSettings = defaultPaginationSettings(collection.value?._id ?? null);
		let showDeleted = false;
		let globalSearchValue = '';
		let filterShow = false;
		let columnShow = false;
		const currentStates = (() => ({
			language: app.contentLanguage,
			systemLanguage: app.systemLanguage,
			mode: mode.value,
			collection: collection.value,
			screenSize: screen.size
		}))();
		const currentLanguage = propContentLanguage || currentStates.language;
		const currentCollection = currentStates.collection;
		(() => {
			if (!currentCollection?.fields) return [];
			const cacheKey = `${currentCollection._id}-${currentCollection.fields.length}`;
			const schemaHeaders = currentCollection.fields.map((field) => ({
				id: `${cacheKey}-${getFieldName(field)}`,
				label: field.label,
				name: getFieldName(field),
				visible: true
			}));
			const systemHeaders = [
				{
					id: `${cacheKey}-createdAt`,
					label: 'createdAt',
					name: 'createdAt',
					visible: true
				},
				{
					id: `${cacheKey}-updatedAt`,
					label: 'updatedAt',
					name: 'updatedAt',
					visible: true
				},
				{
					id: `${cacheKey}-status`,
					label: 'status',
					name: 'status',
					visible: true
				}
			];
			return [...schemaHeaders, ...systemHeaders];
		})();
		let displayTableHeaders = [];
		const visibleTableHeaders = displayTableHeaders.filter((header) => header.visible);
		let selectAllColumns = true;
		const cellPaddingClass =
			entryListPaginationSettings.density === 'compact'
				? '!p-1'
				: entryListPaginationSettings.density === 'comfortable'
					? '!p-3'
					: // Comfortable
						'!p-2';
		const hasSelections = (() => {
			return Object.values(selectedMap).some((isSelected) => isSelected);
		})();
		const hasActiveFilters = Object.values(entryListPaginationSettings.filters).some((f) => !!f) || !!globalSearchValue;
		setModifyEntry(async (status) => {
			const selectedIds = getSelectedIds();
			if (!selectedIds.length) {
				showToast('No entries selected', 'warning');
				return;
			}
			showStatusChangeConfirm({
				status: String(status ?? ''),
				count: selectedIds.length,
				onConfirm: async () => {
					await setEntriesStatus(selectedIds, status, onActionSuccess);
				}
			});
		});
		const pathSegments = page.url.pathname.split('/').filter(Boolean);
		const categoryName = (() => {
			if (breadcrumb && breadcrumb.length > 0) {
				return breadcrumb.map((b) => b.name).join(' > ');
			}
			const segments = pathSegments?.slice() ?? [];
			if (segments.length > 0) {
				segments.shift();
			}
			return segments.slice(0, -1).join('>') || '';
		})();
		const getSelectedIds = () =>
			Object.entries(selectedMap)
				.filter(([, isSelected]) => isSelected)
				.map(([index]) => tableData[Number(index)]._id);
		const getSelectedRawEntries = () =>
			Object.entries(selectedMap)
				.filter(([, isSelected]) => isSelected)
				.map(([index]) => tableData[Number(index)])
				.filter(Boolean);
		const onCreate = async () => {
			const newEntry = {};
			if (currentCollection?.fields) {
				for (const field of currentCollection.fields) {
					if (typeof field === 'object' && field !== null && 'label' in field && 'type' in field) {
						const fieldName = getFieldName(field, false);
						newEntry[fieldName] = null;
					}
				}
			}
			if (collection.value?.status) {
				newEntry.status = collection.value.status;
			}
			setMode('create');
			setCollectionValue(newEntry);
			reflectModeInURL('create');
			await Promise.resolve();
			ui.forceUpdate();
			logger.debug('[Create] INSTANT - New entry mode');
		};
		const onPublish = () => setEntriesStatus(getSelectedIds(), StatusTypes.publish, onActionSuccess);
		const onUnpublish = () => setEntriesStatus(getSelectedIds(), StatusTypes.unpublish, onActionSuccess);
		const onDraft = () => setEntriesStatus(getSelectedIds(), StatusTypes.draft, onActionSuccess);
		const onDelete = (isPermanent = false) => {
			const selectedIds = getSelectedIds();
			if (!selectedIds.length) {
				showToast('No entries selected', 'warning');
				return;
			}
			const useArchiving = publicEnv?.USE_ARCHIVE_ON_DELETE ?? false;
			const isForArchived = showDeleted || isPermanent;
			const willDelete = !useArchiving || isForArchived;
			const actionVerb = willDelete ? 'delete' : 'archive';
			showDeleteConfirm({
				isArchive: !willDelete,
				count: selectedIds.length,
				onConfirm: async () => {
					try {
						if (willDelete) {
							try {
								const collId = collection.value?._id;
								if (collId) {
									const result = await batchDeleteEntries(collId, selectedIds);
									if (result.success) {
										showToast(`${selectedIds.length} ${selectedIds.length === 1 ? 'entry' : 'entries'} deleted successfully`, 'success');
									} else {
										throw new Error('Batch delete failed');
									}
								}
							} catch (batchError) {
								logger.warn('Batch delete failed, using individual deletes:', batchError);
								await Promise.all(
									selectedIds.map((entryId) => {
										const collId = collection.value?._id;
										if (collId) {
											return deleteEntry(collId, entryId);
										}
										return Promise.resolve();
									})
								);
								showToast(`${selectedIds.length} ${selectedIds.length === 1 ? 'entry' : 'entries'} deleted successfully`, 'success');
							}
						} else {
							await setEntriesStatus(selectedIds, StatusTypes.archive, () => {});
						}
						onActionSuccess();
					} catch (error) {
						showToast(`Failed to ${actionVerb} entries: ${error.message}`, 'error');
					}
				}
			});
		};
		const onClone = () => cloneEntries(getSelectedRawEntries(), onActionSuccess);
		const onSchedule = (date) => {
			const payload = { _scheduled: new Date(date).getTime() };
			setEntriesStatus(getSelectedIds(), StatusTypes.draft, onActionSuccess, payload);
		};
		let $$settled = true;
		let $$inner_renderer;
		function $$render_inner($$renderer3) {
			if (!currentCollection) {
				$$renderer3.push('<!--[-->');
				$$renderer3.push(
					`<div class="dark:bg-error-950 flex h-64 flex-col items-center justify-center rounded-lg border border-error-500 bg-error-50 p-8 svelte-3r5klu"><svg class="mb-4 h-16 w-16 text-error-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg> <h3 class="mb-2 text-xl font-bold text-error-600 dark:text-error-400">Collection Not Found</h3> <p class="text-center text-error-600 dark:text-error-400">The requested collection could not be loaded. Please check the collection name and try again.</p></div>`
				);
			} else {
				$$renderer3.push('<!--[!-->');
				$$renderer3.push(
					`<div class="mb-2 flex justify-between dark:text-white svelte-3r5klu"><div class="flex items-center justify-between svelte-3r5klu">`
				);
				if (ui.state.leftSidebar === 'hidden') {
					$$renderer3.push('<!--[-->');
					$$renderer3.push(
						`<button type="button" aria-label="Open Sidebar" class="preset-outlined-surface-500 btn-icon mt-1"><iconify-icon icon="mingcute:menu-fill" width="24"></iconify-icon></button>`
					);
				} else {
					$$renderer3.push('<!--[!-->');
				}
				$$renderer3.push(
					`<!--]--> <div${attr_class(`mr-1 flex flex-col ${stringify(!ui.state.leftSidebar ? 'ml-2' : 'ml-1 sm:ml-2')}`, 'svelte-3r5klu')}>`
				);
				if (categoryName) {
					$$renderer3.push('<!--[-->');
					$$renderer3.push(
						`<div class="mb-2 text-xs capitalize text-surface-500 dark:text-surface-300 rtl:text-left svelte-3r5klu">${escape_html(categoryName)}</div>`
					);
				} else {
					$$renderer3.push('<!--[!-->');
				}
				$$renderer3.push(
					`<!--]--> <div class="-mt-2 flex justify-start text-sm font-bold uppercase dark:text-white md:text-2xl lg:text-xl svelte-3r5klu">`
				);
				if (currentCollection?.icon) {
					$$renderer3.push('<!--[-->');
					$$renderer3.push(
						`<span><iconify-icon${attr('icon', currentCollection.icon)} width="24" class="mr-1 text-error-500 sm:mr-2"></iconify-icon></span>`
					);
				} else {
					$$renderer3.push('<!--[!-->');
				}
				$$renderer3.push(`<!--]--> `);
				if (currentCollection?.name) {
					$$renderer3.push('<!--[-->');
					$$renderer3.push(
						`<div class="flex max-w-[85px] whitespace-normal leading-3 sm:mr-2 sm:max-w-none md:mt-0 md:leading-none xs:mt-1 svelte-3r5klu">${escape_html(currentCollection.name)} `
					);
					if (collectionStats) {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(`<span class="ml-2 text-xs font-normal text-surface-500">(${escape_html(collectionStats.count)})</span>`);
					} else {
						$$renderer3.push('<!--[!-->');
					}
					$$renderer3.push(`<!--]--></div>`);
				} else {
					$$renderer3.push('<!--[!-->');
				}
				$$renderer3.push(
					`<!--]--></div></div></div> <div class="flex items-center justify-between gap-1 svelte-3r5klu"><button type="button" class="preset-outlined-surface-500 btn-icon p-1 sm:hidden" aria-label="Expand/Collapse Filters"><iconify-icon icon="material-symbols:filter-list-rounded" width="30"></iconify-icon></button> <div class="mt-1 sm:hidden svelte-3r5klu">`
				);
				TranslationStatus($$renderer3);
				$$renderer3.push(`<!----></div> <div class="relative mt-1 hidden items-center justify-center gap-2 sm:flex svelte-3r5klu">`);
				TableFilter($$renderer3, {
					get globalSearchValue() {
						return globalSearchValue;
					},
					set globalSearchValue($$value) {
						globalSearchValue = $$value;
						$$settled = false;
					},
					get filterShow() {
						return filterShow;
					},
					set filterShow($$value) {
						filterShow = $$value;
						$$settled = false;
					},
					get columnShow() {
						return columnShow;
					},
					set columnShow($$value) {
						columnShow = $$value;
						$$settled = false;
					},
					get density() {
						return entryListPaginationSettings.density;
					},
					set density($$value) {
						entryListPaginationSettings.density = $$value;
						$$settled = false;
					}
				});
				$$renderer3.push(`<!----> `);
				TranslationStatus($$renderer3);
				$$renderer3.push(`<!----></div> <div class="flex w-full items-center justify-end sm:mt-0 sm:w-auto svelte-3r5klu">`);
				EntryList_MultiButton($$renderer3, {
					isCollectionEmpty: tableData?.length === 0,
					hasSelections,
					selectedCount: Object.values(selectedMap).filter(Boolean).length,
					selectedItems: getSelectedRawEntries(),
					publish: onPublish,
					unpublish: onUnpublish,
					schedule: onSchedule,
					delete: onDelete,
					draft: onDraft,
					clone: onClone,
					create: onCreate,
					get showDeleted() {
						return showDeleted;
					},
					set showDeleted($$value) {
						showDeleted = $$value;
						$$settled = false;
					}
				});
				$$renderer3.push(`<!----></div></div></div> `);
				{
					$$renderer3.push('<!--[!-->');
				}
				$$renderer3.push(`<!--]--> `);
				if (columnShow) {
					$$renderer3.push('<!--[-->');
					$$renderer3.push(
						`<div class="rounded-b-0 flex flex-col justify-center rounded-t-md border-b bg-secondary-100 p-2 text-center dark:bg-surface-700 svelte-3r5klu"><div class="text-sm dark:text-primary-500 svelte-3r5klu">${escape_html(entrylist_dnd())}</div> <div class="my-2 flex w-full flex-col items-center justify-center gap-2 sm:flex-row sm:gap-4 svelte-3r5klu"><div class="flex items-center gap-2 svelte-3r5klu"><label class="flex items-center"><input type="checkbox"${attr('checked', selectAllColumns, true)} class="mr-1"/> ${escape_html(entrylist_all())}</label> <button class="bg-surface-400 btn text-white"><iconify-icon icon="material-symbols-light:device-reset" width="20" class="mr-1 text-white"></iconify-icon> Reset View</button></div> <section class="flex w-full flex-wrap justify-center gap-2 p-2 border-2 border-dashed border-secondary-500/50 rounded transition-all hover:border-secondary-500"><!--[-->`
					);
					const each_array = ensure_array_like(displayTableHeaders);
					for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
						let header = each_array[$$index];
						$$renderer3.push(
							`<div class="svelte-3r5klu"><button type="button"${attr_class(`chip ${stringify(header.visible ? 'dark:preset-filled-primary-500 preset-filled-tertiary-500' : 'ring ring-surface-500 bg-transparent text-secondary-500')} flex items-center justify-center text-xs cursor-move`)}>`
						);
						if (header.visible) {
							$$renderer3.push('<!--[-->');
							$$renderer3.push(`<iconify-icon icon="fa:check" class="mr-1"></iconify-icon>`);
						} else {
							$$renderer3.push('<!--[!-->');
						}
						$$renderer3.push(`<!--]--> <span class="capitalize">${escape_html(header.label)}</span></button></div>`);
					}
					$$renderer3.push(`<!--]--></section></div></div>`);
				} else {
					$$renderer3.push('<!--[!-->');
				}
				$$renderer3.push(`<!--]--> `);
				if (tableData.length > 0 || hasActiveFilters) {
					$$renderer3.push('<!--[-->');
					$$renderer3.push(
						`<div class="table-container max-h-[calc(100dvh)] overflow-auto svelte-3r5klu"><table class="table table-interactive table-hover"><thead class="sticky top-0 z-10 bg-secondary-100 text-tertiary-500 dark:bg-surface-900 dark:text-primary-500">`
					);
					if (filterShow && visibleTableHeaders.length > 0) {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(`<tr class="divide-x divide-surface-400 dark:divide-surface-600"><th>`);
						if (Object.values(entryListPaginationSettings.filters).some((f) => f !== '')) {
							$$renderer3.push('<!--[-->');
							$$renderer3.push(
								`<button aria-label="Clear All Filters" class="preset-outlined-surface-500 btn-icon"><iconify-icon icon="material-symbols:close" width="18"></iconify-icon></button>`
							);
						} else {
							$$renderer3.push('<!--[!-->');
						}
						$$renderer3.push(`<!--]--></th><!--[-->`);
						const each_array_1 = ensure_array_like(visibleTableHeaders);
						for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
							let header = each_array_1[$$index_1];
							$$renderer3.push(`<th><div class="flex items-center justify-between svelte-3r5klu">`);
							FloatingInput($$renderer3, {
								type: 'text',
								icon: 'material-symbols:search-rounded',
								label: `Filter ${header.label}`,
								name: header.name,
								value: entryListPaginationSettings.filters[header.name] || '',
								onInput: (value) => onFilterChange(header.name, value),
								inputClass: 'text-xs dark:text-primary-500',
								textColor: '',
								labelClass: 'dark:text-white'
							});
							$$renderer3.push(`<!----></div></th>`);
						}
						$$renderer3.push(`<!--]--></tr>`);
					} else {
						$$renderer3.push('<!--[!-->');
					}
					$$renderer3.push(`<!--]--><tr class="divide-x divide-surface-400 border-b border-black dark:border-white">`);
					TableIcons($$renderer3, {
						cellClass: `w-10 ${hasSelections ? 'bg-primary-500/10 dark:bg-secondary-500/20' : ''}`,
						checked: SelectAll,
						onCheck: (checked) => {
							SelectAll = checked;
						}
					});
					$$renderer3.push(`<!----><!--[-->`);
					const each_array_2 = ensure_array_like(visibleTableHeaders);
					for (let $$index_2 = 0, $$length = each_array_2.length; $$index_2 < $$length; $$index_2++) {
						let header = each_array_2[$$index_2];
						$$renderer3.push(
							`<th${attr_class(`cursor-pointer text-center text-xs sm:text-sm ${stringify(cellPaddingClass)} ${stringify(header.name === entryListPaginationSettings.sorting.sortedBy ? 'font-semibold text-primary-500 dark:text-secondary-400' : 'text-tertiary-500 dark:text-primary-500')}`)}><div class="flex items-center justify-center svelte-3r5klu">${escape_html(header.label)} `
						);
						if (header.name === entryListPaginationSettings.sorting.sortedBy && entryListPaginationSettings.sorting.isSorted !== 0);
						else {
							$$renderer3.push('<!--[!-->');
						}
						$$renderer3.push(`<!--]--></div></th>`);
					}
					$$renderer3.push(`<!--]--></tr></thead><tbody>`);
					if (tableData.length > 0) {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(`<!--[-->`);
						const each_array_3 = ensure_array_like(tableData);
						for (let index = 0, $$length = each_array_3.length; index < $$length; index++) {
							let entry = each_array_3[index];
							$$renderer3.push(
								`<tr${attr_class(`divide-x divide-surface-400 dark:divide-surface-700 ${stringify(selectedMap[index] ? 'bg-primary-500/5 dark:bg-secondary-500/10' : '')}`)}>`
							);
							TableIcons($$renderer3, {
								cellClass: `w-10 text-center ${selectedMap[index] ? 'bg-primary-500/10 dark:bg-secondary-500/20' : ''}`,
								checked: selectedMap[index],
								onCheck: (isChecked) => {
									selectedMap[index] = isChecked;
								}
							});
							$$renderer3.push(`<!---->`);
							if (visibleTableHeaders) {
								$$renderer3.push('<!--[-->');
								$$renderer3.push(`<!--[-->`);
								const each_array_4 = ensure_array_like(visibleTableHeaders);
								for (let $$index_3 = 0, $$length2 = each_array_4.length; $$index_3 < $$length2; $$index_3++) {
									let header = each_array_4[$$index_3];
									$$renderer3.push(
										`<td${attr_class(`text-center ${stringify(cellPaddingClass)} text-xs font-bold sm:text-sm ${stringify(header.name !== 'status' ? 'cursor-pointer transition-colors duration-200 hover:bg-primary-500/10 dark:hover:bg-secondary-500/20' : 'cursor-pointer transition-colors duration-200 hover:bg-warning-500/10 dark:hover:bg-warning-500/20')}`)}${attr('title', header.name !== 'status' ? 'Click to edit this entry' : 'Click to change status')}>`
									);
									if (header.name === 'status') {
										$$renderer3.push('<!--[-->');
										$$renderer3.push(`<div class="flex w-full items-center justify-center svelte-3r5klu">`);
										Status($$renderer3, { value: entry.status || entry.raw_status || 'draft' });
										$$renderer3.push(`<!----></div>`);
									} else {
										$$renderer3.push('<!--[!-->');
										if (header.name === 'createdAt' || header.name === 'updatedAt') {
											$$renderer3.push('<!--[-->');
											$$renderer3.push(
												`<div class="flex flex-col text-xs svelte-3r5klu"><div class="font-semibold svelte-3r5klu">${escape_html(formatDisplayDate(entry[header.name], 'en', { year: 'numeric', month: 'short', day: 'numeric' }))}</div> <div class="text-surface-500 dark:text-surface-200 svelte-3r5klu">${escape_html(
													formatDisplayDate(entry[header.name], 'en', {
														hour: '2-digit',
														minute: '2-digit',
														second: '2-digit',
														hour12: false
													})
												)}</div></div>`
											);
										} else {
											$$renderer3.push('<!--[!-->');
											if (typeof entry[header.name] === 'object' && entry[header.name] !== null) {
												$$renderer3.push('<!--[-->');
												const fieldData = entry[header.name];
												const translatedValue = fieldData[currentLanguage] || Object.values(fieldData)[0] || '-';
												const debugInfo = `Field: ${header.name}, Lang: ${currentLanguage}, Data: ${JSON.stringify(fieldData)}, Value: ${translatedValue}`;
												if (header.name === 'last_name') {
													$$renderer3.push('<!--[-->');
													$$renderer3.push(`<span${attr('title', debugInfo)}>${html(translatedValue)}</span>`);
												} else {
													$$renderer3.push('<!--[!-->');
													$$renderer3.push(`${html(translatedValue)}`);
												}
												$$renderer3.push(`<!--]-->`);
											} else {
												$$renderer3.push('<!--[!-->');
												$$renderer3.push(`${html(entry[header.name] || '-')}`);
											}
											$$renderer3.push(`<!--]-->`);
										}
										$$renderer3.push(`<!--]-->`);
									}
									$$renderer3.push(`<!--]--></td>`);
								}
								$$renderer3.push(`<!--]-->`);
							} else {
								$$renderer3.push('<!--[!-->');
							}
							$$renderer3.push(`<!--]--></tr>`);
						}
						$$renderer3.push(`<!--]-->`);
					} else {
						$$renderer3.push('<!--[!-->');
						$$renderer3.push(
							`<tr><td${attr('colspan', visibleTableHeaders.length + 1)} class="p-4 text-center text-surface-500 dark:text-surface-50">No results found.</td></tr>`
						);
					}
					$$renderer3.push(
						`<!--]--></tbody></table></div> <div class="sticky bottom-0 left-0 right-0 z-10 mt-1 flex flex-col items-center justify-center border-t border-surface-300 bg-secondary-100 dark:text-surface-50 dark:bg-surface-800 md:flex-row md:justify-between md:p-4 svelte-3r5klu">`
					);
					TablePagination($$renderer3, {
						currentPage: serverPagination.currentPage,
						rowsPerPage: serverPagination.pageSize,
						pagesCount,
						totalItems,
						onUpdatePage,
						onUpdateRowsPerPage
					});
					$$renderer3.push(`<!----></div>`);
				} else {
					$$renderer3.push('<!--[!-->');
					$$renderer3.push(
						`<div class="py-10 text-center text-tertiary-500 dark:text-primary-500 svelte-3r5klu"><iconify-icon icon="bi:exclamation-circle-fill" height="44" class="mb-2"></iconify-icon> <p class="text-lg">${escape_html(currentCollection?.name ? entrylist_no_collection2({ name: currentCollection.name }) : 'No collection selected or collection is empty.')}</p></div>`
					);
				}
				$$renderer3.push(`<!--]-->`);
			}
			$$renderer3.push(`<!--]-->`);
		}
		do {
			$$settled = true;
			$$inner_renderer = $$renderer2.copy();
			$$render_inner($$inner_renderer);
		} while (!$$settled);
		$$renderer2.subsume($$inner_renderer);
	});
}
function WidgetLoader($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let { loader, field, WidgetData = {}, value = void 0, tenantId } = $$props;
		let $$settled = true;
		let $$inner_renderer;
		function $$render_inner($$renderer3) {
			{
				$$renderer3.push('<!--[-->');
				$$renderer3.push(
					`<div class="widget-loader-skeleton animate-pulse svelte-vy7jkz"><div class="mb-2 h-4 w-1/3 rounded bg-surface-300 dark:bg-surface-600 svelte-vy7jkz"></div> <div class="h-10 w-full rounded bg-surface-200 dark:bg-surface-700 svelte-vy7jkz"></div></div>`
				);
			}
			$$renderer3.push(`<!--]-->`);
		}
		do {
			$$settled = true;
			$$inner_renderer = $$renderer2.copy();
			$$render_inner($$inner_renderer);
		} while (!$$settled);
		$$renderer2.subsume($$inner_renderer);
		bind_props($$props, { value });
	});
}
function Fields($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const user = page.data?.user;
		const tenantId = page.data?.tenantId;
		const modules = /* @__PURE__ */ Object.assign({
			'/src/widgets/MissingWidget.svelte': () => import('../../../../chunks/MissingWidget.js'),
			'/src/widgets/core/Checkbox/Display.svelte': () => import('../../../../chunks/Display.js'),
			'/src/widgets/core/Checkbox/Input.svelte': () => import('../../../../chunks/Input.js'),
			'/src/widgets/core/Date/Display.svelte': () => import('../../../../chunks/Display2.js'),
			'/src/widgets/core/Date/Input.svelte': () => import('../../../../chunks/Input14.js'),
			'/src/widgets/core/DateRange/Display.svelte': () => import('../../../../chunks/Display3.js'),
			'/src/widgets/core/DateRange/Input.svelte': () => import('../../../../chunks/Input2.js'),
			'/src/widgets/core/Group/Display.svelte': () => import('../../../../chunks/Display4.js'),
			'/src/widgets/core/Group/Input.svelte': () => import('../../../../chunks/Input3.js'),
			'/src/widgets/core/Input/Display.svelte': () => import('../../../../chunks/Display5.js'),
			'/src/widgets/core/Input/Input.svelte': () => import('../../../../chunks/Input4.js'),
			'/src/widgets/core/MediaUpload/Display.svelte': () => import('../../../../chunks/Display6.js'),
			'/src/widgets/core/MediaUpload/Input.svelte': () => import('../../../../chunks/Input5.js'),
			'/src/widgets/core/MediaUpload/MediaUpload.svelte': () => import('../../../../chunks/MediaUpload.js'),
			'/src/widgets/core/MegaMenu/Display.svelte': () => import('../../../../chunks/Display7.js'),
			'/src/widgets/core/MegaMenu/GuiFields.svelte': () => import('../../../../chunks/GuiFields.js'),
			'/src/widgets/core/MegaMenu/Input.svelte': () => import('../../../../chunks/Input6.js'),
			'/src/widgets/core/MegaMenu/MenuItemEditorModal.svelte': () => import('../../../../chunks/MenuItemEditorModal.js'),
			'/src/widgets/core/Radio/Display.svelte': () => import('../../../../chunks/Display8.js'),
			'/src/widgets/core/Radio/Input.svelte': () => import('../../../../chunks/Input7.js'),
			'/src/widgets/core/Relation/Display.svelte': () => import('../../../../chunks/Display9.js'),
			'/src/widgets/core/Relation/Input.svelte': () => import('../../../../chunks/Input8.js'),
			'/src/widgets/core/RichText/Display.svelte': () => import('../../../../chunks/Display10.js'),
			'/src/widgets/core/RichText/Input.svelte': () => import('../../../../chunks/Input18.js'),
			'/src/widgets/core/RichText/components/ColorSelector.svelte': () => import('../../../../chunks/ColorSelector.js'),
			'/src/widgets/core/RichText/components/DropDown.svelte': () => import('../../../../chunks/DropDown.js'),
			'/src/widgets/core/RichText/components/ImageDescription.svelte': () => import('../../../../chunks/ImageDescription.js'),
			'/src/widgets/core/RichText/components/VideoDialog.svelte': () => import('../../../../chunks/VideoDialog.js'),
			'/src/widgets/custom/Address/Display.svelte': () => import('../../../../chunks/Display11.js'),
			'/src/widgets/custom/Address/Input.svelte': () => import('../../../../chunks/Input15.js'),
			'/src/widgets/custom/ColorPicker/Display.svelte': () => import('../../../../chunks/Display15.js'),
			'/src/widgets/custom/ColorPicker/Input.svelte': () => import('../../../../chunks/Input9.js'),
			'/src/widgets/custom/Currency/Display.svelte': () => import('../../../../chunks/Display12.js'),
			'/src/widgets/custom/Currency/Input.svelte': () => import('../../../../chunks/Input10.js'),
			'/src/widgets/custom/Email/Display.svelte': () => import('../../../../chunks/Display16.js'),
			'/src/widgets/custom/Email/Input.svelte': () => import('../../../../chunks/Input11.js'),
			'/src/widgets/custom/Number/Display.svelte': () => import('../../../../chunks/Display13.js'),
			'/src/widgets/custom/Number/Input.svelte': () => import('../../../../chunks/Input12.js'),
			'/src/widgets/custom/PhoneNumber/Display.svelte': () => import('../../../../chunks/Display17.js'),
			'/src/widgets/custom/PhoneNumber/Input.svelte': () => import('../../../../chunks/Input16.js'),
			'/src/widgets/custom/Rating/Display.svelte': () => import('../../../../chunks/Display18.js'),
			'/src/widgets/custom/Rating/Input.svelte': () => import('../../../../chunks/Input19.js'),
			'/src/widgets/custom/RemoteVideo/Display.svelte': () => import('../../../../chunks/Display14.js'),
			'/src/widgets/custom/RemoteVideo/Input.svelte': () => import('../../../../chunks/Input17.js'),
			'/src/widgets/custom/Seo/Display.svelte': () => import('../../../../chunks/Display19.js'),
			'/src/widgets/custom/Seo/Input.svelte': () => import('../../../../chunks/Input13.js'),
			'/src/widgets/custom/Seo/components/AnalysisModal.svelte': () => import('../../../../chunks/AnalysisModal.js'),
			'/src/widgets/custom/Seo/components/DescriptionInput.svelte': () => import('../../../../chunks/DescriptionInput.js'),
			'/src/widgets/custom/Seo/components/Heatmap.svelte': () => import('../../../../chunks/Heatmap.js'),
			'/src/widgets/custom/Seo/components/RobotsMetaInput.svelte': () => import('../../../../chunks/RobotsMetaInput.js'),
			'/src/widgets/custom/Seo/components/SeoAnalysisPanel.svelte': () => import('../../../../chunks/SeoAnalysisPanel.js'),
			'/src/widgets/custom/Seo/components/SeoField.svelte': () => import('../../../../chunks/SeoField.js'),
			'/src/widgets/custom/Seo/components/SeoPreview.svelte': () => import('../../../../chunks/SeoPreview.js'),
			'/src/widgets/custom/Seo/components/SocialPreview.svelte': () => import('../../../../chunks/SocialPreview.js'),
			'/src/widgets/custom/Seo/components/TitleInput.svelte': () => import('../../../../chunks/TitleInput.js')
		});
		let widgetFunctions = {};
		let {
			fields,
			revisions = []
			// contentLanguage prop received but not directly used - widgets access contentLanguage store
		} = $$props;
		let localTabSet = '0';
		let apiUrl = '';
		let currentCollectionValue = {};
		let selectedRevisionId = '';
		let currentContentLanguage = contentLanguage.value;
		let selectedRevision = revisions.find((r) => r._id === selectedRevisionId) || null;
		let derivedFields = fields || [];
		let currentTranslationProgress = translationProgress.value;
		let availableLanguages = (() => {
			const languages = publicEnv?.AVAILABLE_CONTENT_LANGUAGES;
			if (!languages || !Array.isArray(languages)) {
				return ['en'];
			}
			return languages;
		})();
		function getFieldTranslationPercentage(field) {
			if (!field.translated) return 100;
			const fieldName = `${collection.value?.name}.${getFieldName(field)}`;
			const allLangs = availableLanguages;
			if (allLangs.length === 0) return 100;
			let translatedCount = 0;
			for (const lang of allLangs) {
				const langProgress = currentTranslationProgress?.[lang];
				if (langProgress && langProgress.translated.has(fieldName)) {
					translatedCount++;
				}
			}
			return Math.round((translatedCount / allLangs.length) * 100);
		}
		function getTranslationTextColor(percentage) {
			if (percentage === 100) return 'text-tertiary-500 dark:text-primary-500';
			return 'text-error-500';
		}
		function ensureFieldProperties(field) {
			if (!field) return null;
			return {
				...field,
				db_fieldName: field.db_fieldName || getFieldName(field, true),
				widget: field.widget || { Name: field.type || 'Input' },
				permissions: field.permissions || {}
			};
		}
		let filteredFields = derivedFields
			.map(ensureFieldProperties)
			.filter(Boolean)
			.filter((field) => {
				if (!field.permissions || page.data?.isAdmin || !user?.role) return true;
				const rolePermissions = field.permissions[user.role];
				return !rolePermissions || rolePermissions.read !== false;
			});
		let $$settled = true;
		let $$inner_renderer;
		function $$render_inner($$renderer3) {
			Tabs($$renderer3, {
				value: localTabSet,
				onValueChange: (e) => (localTabSet = e.value),
				class: 'flex flex-1 flex-col items-center',
				children: ($$renderer4) => {
					$$renderer4.push(`<!---->`);
					Tabs.List($$renderer4, {
						class:
							'flex justify-between md:justify-around rounded-tl-container rounded-tr-container border-b border-tertiary-500 dark:border-primary-500 w-full',
						children: ($$renderer5) => {
							$$renderer5.push(`<!---->`);
							Tabs.Trigger($$renderer5, {
								value: '0',
								class: 'flex-1',
								children: ($$renderer6) => {
									$$renderer6.push(
										`<div class="flex items-center justify-center gap-2 py-2"><iconify-icon icon="mdi:pen" width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon> ${escape_html(button_edit())}</div>`
									);
								},
								$$slots: { default: true }
							});
							$$renderer5.push(`<!----> `);
							if (collection.value?.revision) {
								$$renderer5.push('<!--[-->');
								$$renderer5.push(`<!---->`);
								Tabs.Trigger($$renderer5, {
									value: '1',
									class: 'flex-1',
									children: ($$renderer6) => {
										$$renderer6.push(
											`<div class="flex items-center justify-center gap-2 py-2"><iconify-icon icon="mdi:history" width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon> ${escape_html(applayout_version())} <span class="preset-filled-secondary-500 badge">${escape_html(revisions.length)}</span></div>`
										);
									},
									$$slots: { default: true }
								});
								$$renderer5.push(`<!---->`);
							} else {
								$$renderer5.push('<!--[!-->');
							}
							$$renderer5.push(`<!--]--> `);
							if (collection.value?.livePreview) {
								$$renderer5.push('<!--[-->');
								$$renderer5.push(`<!---->`);
								Tabs.Trigger($$renderer5, {
									value: '2',
									class: 'flex-1',
									children: ($$renderer6) => {
										$$renderer6.push(
											`<div class="flex items-center justify-center gap-2 py-2"><iconify-icon icon="mdi:eye-outline" width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon> ${escape_html(fields_preview1())}</div>`
										);
									},
									$$slots: { default: true }
								});
								$$renderer5.push(`<!---->`);
							} else {
								$$renderer5.push('<!--[!-->');
							}
							$$renderer5.push(`<!--]--> `);
							if (user?.isAdmin) {
								$$renderer5.push('<!--[-->');
								$$renderer5.push(`<!---->`);
								Tabs.Trigger($$renderer5, {
									value: '3',
									class: 'flex-1',
									children: ($$renderer6) => {
										$$renderer6.push(
											`<div class="flex items-center justify-center gap-2 py-2"><iconify-icon icon="mdi:api" width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon> API</div>`
										);
									},
									$$slots: { default: true }
								});
								$$renderer5.push(`<!---->`);
							} else {
								$$renderer5.push('<!--[!-->');
							}
							$$renderer5.push(`<!--]-->`);
						},
						$$slots: { default: true }
					});
					$$renderer4.push(`<!----> <!---->`);
					Tabs.Content($$renderer4, {
						value: '0',
						class: 'w-full',
						children: ($$renderer5) => {
							$$renderer5.push(
								`<div class="mb-2 text-center text-xs text-error-500">${escape_html(form_required())}</div> <div class="rounded-md border bg-white px-4 py-6 drop-shadow-2xl dark:border-surface-500 dark:bg-surface-900"><div class="flex flex-wrap items-center justify-center gap-1 overflow-auto"><!--[-->`
							);
							const each_array = ensure_array_like(filteredFields);
							for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
								let rawField = each_array[$$index];
								if (rawField.widget) {
									$$renderer5.push('<!--[-->');
									const field = ensureFieldProperties(rawField);
									$$renderer5.push(
										`<div${attr_class(`mx-auto text-center ${stringify(!field?.width ? 'w-full ' : 'max-md:w-full!')}`)}${attr_style('min-width:min(300px,100%);' + (field.width ? `width:calc(${Math.floor(100 / field?.width)}% - 0.5rem)` : ''))}><div class="flex items-center justify-between gap-2 px-[5px] text-start field-label"><div class="flex items-center gap-2"><p class="inline-block font-semibold capitalize">${escape_html(field.label || field.db_fieldName)} `
									);
									if (field.required) {
										$$renderer5.push('<!--[-->');
										$$renderer5.push(`<span class="text-error-500">*</span>`);
									} else {
										$$renderer5.push('<!--[!-->');
									}
									$$renderer5.push(
										`<!--]--></p></div> <div class="flex items-center gap-2"><button type="button" title="Insert Token"${attr('aria-label', `Insert token into ${stringify(field.label)}`)}><iconify-icon icon="mdi:code-braces" width="16" class="font-bold text-tertiary-500 dark:text-primary-500"></iconify-icon></button> `
									);
									if (field.translated) {
										$$renderer5.push('<!--[-->');
										const percentage = getFieldTranslationPercentage(field);
										const textColor = getTranslationTextColor(percentage);
										$$renderer5.push(
											`<div class="flex items-center gap-1 text-xs"><iconify-icon icon="bi:translate" width="16"></iconify-icon> <span class="font-medium text-tertiary-500 dark:text-primary-500">${escape_html(currentContentLanguage.toUpperCase())}</span> <span${attr_class(`font-medium ${stringify(textColor)}`)}>(${escape_html(percentage)}%)</span></div>`
										);
									} else {
										$$renderer5.push('<!--[!-->');
									}
									$$renderer5.push(`<!--]--> `);
									if (field.icon) {
										$$renderer5.push('<!--[-->');
										$$renderer5.push(
											`<iconify-icon${attr('icon', field.icon)} width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>`
										);
									} else {
										$$renderer5.push('<!--[!-->');
									}
									$$renderer5.push(`<!--]--></div></div> `);
									if (field.widget) {
										$$renderer5.push('<!--[-->');
										const widgetName = field.widget.Name;
										const loadedWidget = (() => {
											const storePath = widgetFunctions[widgetName]?.componentPath;
											if (storePath && storePath in modules) return modules[storePath];
											const camelPath = widgetFunctions[widgetName.charAt(0).toLowerCase() + widgetName.slice(1)]?.componentPath;
											if (camelPath && camelPath in modules) return modules[camelPath];
											const lowerPath = widgetFunctions[widgetName.toLowerCase()]?.componentPath;
											if (lowerPath && lowerPath in modules) return modules[lowerPath];
											const normalized = widgetName.toLowerCase();
											for (const path in modules) {
												const lowerPath2 = path.toLowerCase();
												const parts = lowerPath2.split('/');
												const fileName = parts.pop();
												const folderName = parts.pop();
												if (folderName === normalized && fileName === 'input.svelte') return modules[path];
												if (folderName === normalized && fileName === 'index.svelte') return modules[path];
												if (fileName === `${normalized}.svelte` && normalized !== 'input') return modules[path];
											}
											return null;
										})();
										if (loadedWidget) {
											$$renderer5.push('<!--[-->');
											const fieldName = getFieldName(field, false);
											$$renderer5.push(`<!---->`);
											{
												WidgetLoader($$renderer5, {
													loader: loadedWidget,
													field,
													WidgetData: {},
													tenantId,
													get value() {
														return currentCollectionValue[fieldName];
													},
													set value($$value) {
														currentCollectionValue[fieldName] = $$value;
														$$settled = false;
													}
												});
											}
											$$renderer5.push(`<!---->`);
										} else {
											$$renderer5.push('<!--[!-->');
											$$renderer5.push(`<p class="text-error-500">${escape_html(fields_no_widgets_found1({ name: widgetName }))}</p>`);
										}
										$$renderer5.push(`<!--]-->`);
									} else {
										$$renderer5.push('<!--[!-->');
									}
									$$renderer5.push(`<!--]--></div>`);
								} else {
									$$renderer5.push('<!--[!-->');
								}
								$$renderer5.push(`<!--]-->`);
							}
							$$renderer5.push(`<!--]--></div></div>`);
						},
						$$slots: { default: true }
					});
					$$renderer4.push(`<!----> <!---->`);
					Tabs.Content($$renderer4, {
						value: '1',
						class: 'w-full',
						children: ($$renderer5) => {
							$$renderer5.push(`<div class="p-4">`);
							if (revisions.length === 0) {
								$$renderer5.push('<!--[-->');
								$$renderer5.push(`<p class="p-4 text-center text-surface-500">No revision history found for this entry.</p>`);
							} else {
								$$renderer5.push('<!--[!-->');
								$$renderer5.push(`<div class="mb-4 flex items-center justify-between gap-4">`);
								$$renderer5.select({ class: 'select grow', value: selectedRevisionId }, ($$renderer6) => {
									$$renderer6.option({ value: '', disabled: true }, ($$renderer7) => {
										$$renderer7.push(`-- Select a revision to compare --`);
									});
									$$renderer6.push(`<!--[-->`);
									const each_array_1 = ensure_array_like(revisions);
									for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
										let revision = each_array_1[$$index_1];
										$$renderer6.option({ value: revision._id }, ($$renderer7) => {
											$$renderer7.push(
												`${escape_html(new Date(revision.revision_at).toLocaleString())} by ${escape_html(revision.revision_by.substring(0, 8))}...`
											);
										});
									}
									$$renderer6.push(`<!--]-->`);
								});
								$$renderer5.push(
									` <button class="preset-filled-primary-500 btn"${attr('disabled', !selectedRevision?.data, true)}><iconify-icon icon="mdi:restore" class="mr-1"></iconify-icon> Revert</button></div> <div class="rounded-lg border p-4 dark:text-surface-50"><h3 class="mb-3 text-lg font-bold">Changes from Selected Revision</h3> `
								);
								if (selectedRevision) {
									$$renderer5.push('<!--[-->');
									const diffObject = selectedRevision?.diff || null;
									if (diffObject && Object.keys(diffObject).length > 0) {
										$$renderer5.push('<!--[-->');
										$$renderer5.push(`<div class="space-y-3 font-mono text-sm"><!--[-->`);
										const each_array_2 = ensure_array_like(Object.entries(diffObject));
										for (let $$index_2 = 0, $$length = each_array_2.length; $$index_2 < $$length; $$index_2++) {
											let [key, change] = each_array_2[$$index_2];
											const ch = change;
											$$renderer5.push(`<div><strong class="font-bold text-surface-600 dark:text-surface-300">${escape_html(key)}:</strong> `);
											if (ch.status === 'modified') {
												$$renderer5.push('<!--[-->');
												$$renderer5.push(
													`<div class="mt-1 rounded border border-error-500/30 bg-error-500/10 p-2"><span class="text-error-700 dark:text-error-300">- ${escape_html(JSON.stringify(ch.old))}</span></div> <div class="mt-1 rounded border border-success-500/30 bg-success-500/10 p-2"><span class="text-success-700 dark:text-success-300">+ ${escape_html(JSON.stringify(ch.new))}</span></div>`
												);
											} else {
												$$renderer5.push('<!--[!-->');
												if (ch.status === 'added') {
													$$renderer5.push('<!--[-->');
													$$renderer5.push(
														`<div class="mt-1 rounded border border-success-500/30 bg-success-500/10 p-2"><span class="text-success-700 dark:text-success-300">+ ${escape_html(JSON.stringify(ch.value))}</span></div>`
													);
												} else {
													$$renderer5.push('<!--[!-->');
													if (ch.status === 'deleted') {
														$$renderer5.push('<!--[-->');
														$$renderer5.push(
															`<div class="mt-1 rounded border border-error-500/30 bg-error-500/10 p-2"><span class="text-error-700 dark:text-error-300">- ${escape_html(JSON.stringify(ch.value))}</span></div>`
														);
													} else {
														$$renderer5.push('<!--[!-->');
													}
													$$renderer5.push(`<!--]-->`);
												}
												$$renderer5.push(`<!--]-->`);
											}
											$$renderer5.push(`<!--]--></div>`);
										}
										$$renderer5.push(`<!--]--></div>`);
									} else {
										$$renderer5.push('<!--[!-->');
										{
											$$renderer5.push('<!--[!-->');
											$$renderer5.push(`<p class="text-center text-surface-500">Select a revision to see what's changed.</p>`);
										}
										$$renderer5.push(`<!--]-->`);
									}
									$$renderer5.push(`<!--]-->`);
								} else {
									$$renderer5.push('<!--[!-->');
									$$renderer5.push(`<p class="text-center text-surface-500">Select a revision to see what's changed.</p>`);
								}
								$$renderer5.push(`<!--]--></div>`);
							}
							$$renderer5.push(`<!--]--></div>`);
						},
						$$slots: { default: true }
					});
					$$renderer4.push(`<!----> <!---->`);
					Tabs.Content($$renderer4, {
						value: '2',
						class: 'w-full',
						children: ($$renderer5) => {
							const hostProd = publicEnv?.HOST_PROD || 'https://localhost:5173';
							const entryId = collectionValue.value?._id || 'draft';
							const previewUrl = `${hostProd}?preview=${entryId}`;
							$$renderer5.push(
								`<div class="flex h-[600px] flex-col p-4"><div class="mb-4 flex items-center justify-between gap-4"><div class="flex flex-1 items-center gap-2"><iconify-icon icon="mdi:open-in-new" width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon> <input type="text" class="input grow text-sm" readonly${attr('value', previewUrl)}/> <button class="preset-outline-surface-500 btn-sm" aria-label="Copy preview URL"><iconify-icon icon="mdi:content-copy" width="16"></iconify-icon></button></div> <a${attr('href', previewUrl)} target="_blank" rel="noopener noreferrer" class="preset-filled-primary-500 btn-sm"><iconify-icon icon="mdi:open-in-new" width="16" class="mr-1"></iconify-icon> Open</a></div> <div class="flex-1 overflow-hidden rounded-lg border border-surface-300 dark:text-surface-50"><iframe${attr('src', previewUrl)} title="Live Preview" class="h-full w-full" sandbox="allow-same-origin allow-scripts allow-forms allow-popups"></iframe></div> <div class="mt-2 text-center text-xs text-surface-500">Preview URL: ${escape_html(hostProd)}?preview=${escape_html(entryId)}</div></div>`
							);
						},
						$$slots: { default: true }
					});
					$$renderer4.push(`<!----> <!---->`);
					Tabs.Content($$renderer4, {
						value: '3',
						class: 'w-full',
						children: ($$renderer5) => {
							$$renderer5.push(
								`<div class="space-y-4 p-4"><div class="flex items-center gap-2"><input type="text" class="input grow" readonly${attr('value', apiUrl)}/> <button class="preset-outline-surface-500 btn">Copy</button></div> <div class="card p-4 overflow-x-auto bg-surface-800 text-white font-mono text-sm max-h-[500px]"><pre>${escape_html(JSON.stringify(collectionValue.value, null, 2))}</pre></div></div>`
							);
						},
						$$slots: { default: true }
					});
					$$renderer4.push(`<!---->`);
				},
				$$slots: { default: true }
			});
		}
		do {
			$$settled = true;
			$$inner_renderer = $$renderer2.copy();
			$$render_inner($$inner_renderer);
		} while (!$$settled);
		$$renderer2.subsume($$inner_renderer);
	});
}
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { data } = $$props;
		const collectionSchema = data?.collectionSchema;
		const entries = data?.entries || [];
		const pagination = data?.pagination || { currentPage: 1, pageSize: 10, totalItems: 0, pagesCount: 1 };
		const revisions = data?.revisions || [];
		const serverContentLanguage = data?.contentLanguage;
		head('by5baa', $$renderer2, ($$renderer3) => {
			$$renderer3.title(($$renderer4) => {
				$$renderer4.push(`<title>${escape_html(collectionSchema?.name ?? 'Collection')} - SveltyCMS</title>`);
			});
		});
		$$renderer2.push(`<div class="content h-full">`);
		{
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--> `);
		if (!collections.active) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<div class="dark:bg-error-950 flex h-64 flex-col items-center justify-center rounded-lg border border-error-500 bg-error-50 p-8"><svg class="mb-4 h-16 w-16 text-error-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg> <h3 class="mb-2 text-xl font-bold text-error-600 dark:text-error-400">Collection Not Loaded</h3> <p class="text-center text-error-600 dark:text-error-400">Unable to load collection schema. Please refresh the page.</p></div>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
			if (collections.mode === 'view' || collections.mode === 'modify') {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(`<!---->`);
				{
					EntryList($$renderer2, { entries, pagination, contentLanguage: serverContentLanguage });
				}
				$$renderer2.push(`<!---->`);
			} else {
				$$renderer2.push('<!--[!-->');
				if (['edit', 'create'].includes(collections.mode)) {
					$$renderer2.push('<!--[-->');
					$$renderer2.push(
						`<div id="fields_container" class="fields max-h-[calc(100vh-100px)] overflow-y-auto overflow-x-visible max-md:max-h-[calc(100vh-120px)]">`
					);
					Fields($$renderer2, {
						fields: collections.active.fields,
						revisions
					});
					$$renderer2.push(`<!----></div>`);
				} else {
					$$renderer2.push('<!--[!-->');
				}
				$$renderer2.push(`<!--]-->`);
			}
			$$renderer2.push(`<!--]-->`);
		}
		$$renderer2.push(`<!--]--></div>`);
	});
}
export { _page as default };
//# sourceMappingURL=_page.svelte.js.map
