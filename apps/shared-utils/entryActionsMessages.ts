/**
 * @file src/utils/entryActionsMessages.ts
 * @description Centralized messages for entry actions to improve localization
 */

import * as m from '@src/paraglide/messages';

export const entryMessages = {
	// Status update messages
	entriesArchived: (count: number) => m.entries_archived?.({ count }) || `${count} ${count === 1 ? 'entry' : 'entries'} archived successfully`,

	entriesPublished: (count: number) => m.entries_published?.({ count }) || `${count} ${count === 1 ? 'entry' : 'entries'} published successfully`,

	entriesUnpublished: (count: number) =>
		m.entries_unpublished?.({ count }) || `${count} ${count === 1 ? 'entry' : 'entries'} unpublished successfully`,

	entriesSetToTest: (count: number) => m.entries_set_to_test?.({ count }) || `${count} ${count === 1 ? 'entry' : 'entries'} set to test successfully`,

	entriesDeleted: (count: number) => m.entries_deleted?.({ count }) || `${count} ${count === 1 ? 'entry' : 'entries'} deleted successfully`,

	entriesScheduled: (count: number) => m.entries_scheduled?.({ count }) || `${count} ${count === 1 ? 'entry' : 'entries'} scheduled successfully`,

	entriesCloned: (count: number) => m.entries_cloned?.({ count }) || `${count} ${count === 1 ? 'entry' : 'entries'} cloned successfully`,

	entriesUpdated: (count: number, status: string) =>
		m.entries_updated?.({ count, status }) || `${count} ${count === 1 ? 'entry' : 'entries'} updated to ${status}`,

	// Error messages
	updateFailed: (operation: string) => m.update_failed?.({ operation }) || `Failed to ${operation} entries`,

	deleteFailed: (operation: string) => m.delete_failed?.({ operation }) || `Failed to ${operation} entries`,

	noEntriesSelected: () => m.no_entries_selected?.() || 'No entries selected',

	noCollectionFound: () => m.no_collection_found?.() || 'Collection not found',

	// Single entry messages
	entryArchived: () => m.entry_archived?.() || 'Entry archived successfully',

	entryDeleted: () => m.entry_deleted_success?.() || 'Entry deleted successfully',

	entrySaved: () => m.entry_saved?.() || 'Entry saved successfully',

	entryStatusUpdated: (status: string) => m.entry_status_updated?.({ status }) || `Entry status updated to ${status}`,

	entryScheduled: (date: string) => m.entry_scheduled?.({ date }) || `Entry scheduled for ${date}`,

	entryCloned: () => m.entry_cloned_success?.() || 'Entry cloned successfully',

	// Admin permissions
	onlyAdminsCanDelete: () => m.only_admins_can_delete?.() || 'Only administrators can delete archived entries',

	statusReservedForSystem: (status: string) => m.status_reserved_for_system?.({ status }) || `${status} status is reserved for system operations`,

	// Unsaved changes
	unsavedChangesTitle: () => m.unsaved_changes_title?.() || 'Unsaved Changes',

	unsavedChangesBody: () => m.unsaved_changes_body?.() || 'You have unsaved changes. Do you want to save them as a draft before leaving?',

	saveAsDraftAndLeave: () => m.save_as_draft_and_leave?.() || 'Save as Draft and Leave',

	stayAndContinueEditing: () => m.stay_and_continue_editing?.() || 'Stay and Continue Editing',

	changesSavedAsDraft: () => m.changes_saved_as_draft?.() || 'Changes saved as draft',

	errorSavingDraft: (error: string) => m.error_saving_draft?.({ error }) || `Error saving draft: ${error}`,

	// Scheduling
	noEntryForScheduling: () => m.no_entry_for_scheduling?.() || 'No entry selected for scheduling',

	entryScheduledStatus: () => m.entry_scheduled_status?.() || 'Entry status changed to scheduled',

	errorScheduling: (error: string) => m.error_scheduling?.({ error }) || `Error scheduling entry: ${error}`,

	// Common actions
	confirm: () => m.button_confirm?.() || 'Confirm',

	cancel: () => m.button_cancel?.() || 'Cancel',

	delete: () => m.button_delete?.() || 'Delete',

	archive: () => m.button_archive?.() || 'Archive',

	publish: () => m.entrylist_multibutton_publish?.() || 'Publish',

	unpublish: () => m.entrylist_multibutton_unpublish?.() || 'Unpublish',

	schedule: () => m.entrylist_multibutton_schedule?.() || 'Schedule',

	clone: () => m.entrylist_multibutton_clone?.() || 'Clone',

	test: () => m.button_test?.() || 'Test'
};
