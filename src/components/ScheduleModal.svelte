<!--
@file src/components/ScheduleModal.svelte
@component
**ScheduleModal component for scheduling actions on entries**

@example
<ScheduleModal open={isModalOpen} on:close={() => isModalOpen = false} />

### Props:
- `open` {boolean} - Whether the modal is open
- `on:close` {function} - Event handler for closing the modal

### Features:
- Schedule publish, unpublish, delete actions
- Date and time picker for scheduling
- Action type selection
- Responsive design
- Accessibility improvements (focus management via Skeleton Modal, aria attributes)
- Error handling and validation
- Improved type safety
- Loading state feedback
-->

<script lang="ts">
	import { createEventDispatcher } from 'svelte'; // Re-import createEventDispatcher
	import { page } from '$app/state';
	import { Modal } from '@skeletonlabs/skeleton-svelte';
	// Import modifyEntry store function
	import { selectedEntries, collectionValue, collection, modifyEntry } from '@src/stores/collectionStore.svelte';
	import { saveFormData } from '../utils/data';

	// Auth
	import type { User } from '@src/auth/types';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Props - Make 'open' bindable
	let { open = $bindable() } = $props<{
		open?: boolean;
	}>();

	const dispatch = createEventDispatcher(); // Initialize the dispatcher

	// Skeleton User (assuming it's correctly populated)
	const user: User = page.data.user;

	// Types
	type ActionType = 'published' | 'unpublished' | 'deleted'; // Actions that can be scheduled

	// State
	let scheduleDate: string = $state('');
	let action: ActionType = $state('published'); // Default to a valid action
	let errorMessage: string = $state('');
	let isSubmitting: boolean = $state(false); // For loading/disabled state

	// Action options for the select dropdown
	const actionOptions: Array<{ value: ActionType; label: string }> = [
		{ value: 'published', label: m.entrylist_multibutton_publish() },
		{ value: 'unpublished', label: m.entrylist_multibutton_unpublish() },
		{ value: 'deleted', label: m.button_delete() }
	];

	// Derived state for form validity
	let isFormValid = $derived(scheduleDate !== '' && action !== undefined && !isSubmitting && new Date(scheduleDate) >= new Date());

	// Function to get minimum date/time for the input
	function getMinDateTime(): string {
		const now = new Date();
		// Format to YYYY-MM-DDTHH:mm required by datetime-local
		now.setMinutes(now.getMinutes() - now.getTimezoneOffset()); // Adjust for local timezone
		return now.toISOString().slice(0, 16);
	}

	// Form validation logic
	function validateForm(): boolean {
		errorMessage = ''; // Reset error message
		if (!scheduleDate) {
			errorMessage = 'Please select a date and time.';
			return false;
		}
		if (new Date(scheduleDate) < new Date()) {
			errorMessage = 'Scheduled time must be in the future.';
			return false;
		}
		if (!action) {
			errorMessage = 'Please select an action.';
			return false;
		}
		return true;
	}

	// Form submission handler
	async function onFormSubmit(): Promise<void> {
		if (!validateForm()) return;

		isSubmitting = true;

		try {
			if ($selectedEntries && $selectedEntries.length > 0) {
				const scheduledTime = new Date(scheduleDate).getTime();

				// Use Promise.all for concurrent updates
				await Promise.all(
					$selectedEntries.map(async (entryId) => {
						const entry = collectionValue.value[entryId];
						if (!entry) return; // Skip if entry somehow doesn't exist

						const updateData = {
							_id: entryId,
							_scheduled: scheduledTime,
							_scheduledAction: action, // The action to perform at scheduled time
							status: 'scheduled' // The current status is 'scheduled'
						};

						// Create FormData for saveFormData function
						const formData = new FormData();
						Object.entries(updateData).forEach(([key, value]) => {
							// Ensure values are strings for FormData
							formData.append(key, String(value));
						});

						await saveFormData({
							data: formData,
							_collection: collection.value,
							_mode: 'edit', // We are editing the entry to add schedule info
							id: entryId,
							user: user
						});
					})
				);

				// Call modifyEntry directly to update the store/UI status
				modifyEntry.value('scheduled'); // Set status to scheduled
				dispatch('close'); // Dispatch the close event
			} else {
				errorMessage = 'No entries selected for scheduling.';
			}
		} catch (error) {
			console.error('Error scheduling entries:', error);
			errorMessage = 'An error occurred while scheduling. Please try again.';
			// Optionally re-throw or handle specific error types
		} finally {
			isSubmitting = false; // Re-enable form
		}
	}
</script>

<!-- Skeleton Modal Component -->
<Modal
	{open}
	onOpenChange={(e) => {
		// If Skeleton closes the modal (ESC, backdrop click), dispatch the close event
		if (!e.open) {
			dispatch('close');
			// Reset state on close if desired
			// scheduleDate = '';
			// action = 'published';
			// errorMessage = '';
			// isSubmitting = false;
		}
	}}
	contentBase="card bg-surface-100-900 p-4 md:p-6 space-y-4 shadow-xl max-w-screen-sm rounded-lg"
	backdropClasses="backdrop-blur-sm"
>
	<!-- Modal Content -->
	{#snippet content()}
		<header class="border-surface-300-700 flex items-center justify-between border-b pb-4">
			<h2 class="h2" id="schedule-modal-title">Schedule Action</h2>
			<!-- Close button for accessibility and convenience -->
			<button
				type="button"
				class="btn-icon btn-icon-sm preset-soft hover:preset-ghost"
				aria-label="Close schedule modal"
				onclick={() => dispatch('close')}
			>
				<iconify-icon icon="mdi:close" width="20"></iconify-icon>
			</button>
		</header>

		<article class="py-4">
			<p class="opacity-70" id="schedule-modal-description">Select a future date, time, and action to schedule for the selected entries.</p>
		</article>

		<form
			class="space-y-5"
			aria-labelledby="schedule-modal-title"
			aria-describedby="schedule-modal-description"
			onsubmit={(e) => {
				e.preventDefault();
				onFormSubmit();
			}}
			aria-busy={isSubmitting}
		>
			<!-- Use fieldset to group form controls, disable all when submitting -->
			<fieldset disabled={isSubmitting} class="contents">
				<!-- Screen reader only legend -->
				<legend class="sr-only">Scheduling Details</legend>

				<label class="space-y-2">
					<span class="font-medium">Schedule Date and Time</span>
					<input
						type="datetime-local"
						bind:value={scheduleDate}
						class="input w-full {errorMessage && !scheduleDate ? 'input-error' : ''}"
						required
						min={getMinDateTime()}
						aria-describedby="schedule-error"
						aria-invalid={!!errorMessage && (!scheduleDate || new Date(scheduleDate) < new Date())}
					/>
				</label>

				<label class="space-y-2">
					<span class="font-medium">Action Type</span>
					<select
						bind:value={action}
						class="select w-full {errorMessage && !action ? 'input-error' : ''}"
						required
						aria-describedby="schedule-error"
						aria-invalid={!!errorMessage && !action}
					>
						{#each actionOptions as option}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</label>
			</fieldset>

			<!-- Error Message Area -->
			{#if errorMessage}
				<p class="text-error-500 text-sm" id="schedule-error" role="alert">
					<iconify-icon icon="mdi:alert-circle-outline" class="mr-1 inline-block align-text-bottom"></iconify-icon>
					{errorMessage}
				</p>
			{/if}

			<!-- Action Buttons -->
			<div class="flex justify-end gap-3 pt-4">
				<button type="button" class="btn preset-soft" onclick={() => dispatch('close')} disabled={isSubmitting}> Cancel </button>
				<button type="submit" class="btn preset-filled-primary" disabled={!isFormValid || isSubmitting}>
					{#if isSubmitting}
						<iconify-icon icon="line-md:loading-twotone-loop" width="18" class="mr-2"></iconify-icon>
						Scheduling...
					{:else}
						<iconify-icon icon="mdi:clock-outline" width="18" class="mr-2"></iconify-icon>
						Schedule
					{/if}
				</button>
			</div>
		</form>
	{/snippet}
</Modal>
