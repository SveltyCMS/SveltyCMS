/**
 * @file src/utils/entryActionsMessages.ts
 * @description Centralized messages for entry actions to improve localization
 */

import {
	button_archive,
	button_cancel,
	button_confirm,
	button_delete,
	button_test,
	changes_saved_as_draft,
	delete_failed,
	entries_archived,
	entries_cloned,
	entries_deleted,
	entries_published,
	entries_scheduled,
	entries_set_to_test,
	entries_unpublished,
	entries_updated,
	entry_archived,
	entry_cloned_success,
	entry_deleted_success,
	entry_saved,
	entry_scheduled,
	entry_scheduled_status,
	entry_status_updated,
	entrylist_multibutton_clone,
	entrylist_multibutton_publish,
	entrylist_multibutton_schedule,
	entrylist_multibutton_unpublish,
	error_saving_draft,
	error_scheduling,
	no_collection_found,
	no_entries_selected,
	no_entry_for_scheduling,
	only_admins_can_delete,
	save_as_draft_and_leave,
	status_reserved_for_system,
	stay_and_continue_editing,
	unsaved_changes_body,
	unsaved_changes_title,
	update_failed
} from '@src/paraglide/messages';

export const entryMessages = {
	// Status update messages
	entriesArchived: (count: number) => entries_archived?.({ count }) || `${count} ${count === 1 ? 'entry' : 'entries'} archived successfully`,

	entriesPublished: (count: number) => entries_published?.({ count }) || `${count} ${count === 1 ? 'entry' : 'entries'} published successfully`,

	entriesUnpublished: (count: number) => entries_unpublished?.({ count }) || `${count} ${count === 1 ? 'entry' : 'entries'} unpublished successfully`,

	entriesSetToTest: (count: number) => entries_set_to_test?.({ count }) || `${count} ${count === 1 ? 'entry' : 'entries'} set to test successfully`,

	entriesDeleted: (count: number) => entries_deleted?.({ count }) || `${count} ${count === 1 ? 'entry' : 'entries'} deleted successfully`,

	entriesScheduled: (count: number) => entries_scheduled?.({ count }) || `${count} ${count === 1 ? 'entry' : 'entries'} scheduled successfully`,

	entriesCloned: (count: number) => entries_cloned?.({ count }) || `${count} ${count === 1 ? 'entry' : 'entries'} cloned successfully`,

	entriesUpdated: (count: number, status: string) =>
		entries_updated?.({ count, status }) || `${count} ${count === 1 ? 'entry' : 'entries'} updated to ${status}`,

	// Error messages
	updateFailed: (operation: string) => update_failed?.({ operation }) || `Failed to ${operation} entries`,

	deleteFailed: (operation: string) => delete_failed?.({ operation }) || `Failed to ${operation} entries`,

	noEntriesSelected: () => no_entries_selected?.() || 'No entries selected',

	noCollectionFound: () => no_collection_found?.() || 'Collection not found',

	// Single entry messages
	entryArchived: () => entry_archived?.() || 'Entry archived successfully',

	entryDeleted: () => entry_deleted_success?.() || 'Entry deleted successfully',

	entrySaved: () => entry_saved?.() || 'Entry saved successfully',

	entryStatusUpdated: (status: string) => entry_status_updated?.({ status }) || `Entry status updated to ${status}`,

	entryScheduled: (date: string) => entry_scheduled?.({ date }) || `Entry scheduled for ${date}`,

	entryCloned: () => entry_cloned_success?.() || 'Entry cloned successfully',

	// Admin permissions
	onlyAdminsCanDelete: () => only_admins_can_delete?.() || 'Only administrators can delete archived entries',

	statusReservedForSystem: (status: string) => status_reserved_for_system?.({ status }) || `${status} status is reserved for system operations`,

	// Unsaved changes
	unsavedChangesTitle: () => unsaved_changes_title?.() || 'Unsaved Changes',

	unsavedChangesBody: () => unsaved_changes_body?.() || 'You have unsaved changes. Do you want to save them as a draft before leaving?',

	saveAsDraftAndLeave: () => save_as_draft_and_leave?.() || 'Save as Draft and Leave',

	stayAndContinueEditing: () => stay_and_continue_editing?.() || 'Stay and Continue Editing',

	changesSavedAsDraft: () => changes_saved_as_draft?.() || 'Changes saved as draft',

	errorSavingDraft: (error: string) => error_saving_draft?.({ error }) || `Error saving draft: ${error}`,

	// Scheduling
	noEntryForScheduling: () => no_entry_for_scheduling?.() || 'No entry selected for scheduling',

	entryScheduledStatus: () => entry_scheduled_status?.() || 'Entry status changed to scheduled',

	errorScheduling: (error: string) => error_scheduling?.({ error }) || `Error scheduling entry: ${error}`,

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
