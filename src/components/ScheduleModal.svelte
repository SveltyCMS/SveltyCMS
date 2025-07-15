<!-- 
@file src/components/ScheduleModal.svelte
@component
**ScheduleModal component for scheduling actions on entries**

This is a "dumb" UI component. Its only responsibility is to collect a date,
time, and action from the user and return it via the modal's response function.
It does not contain any API logic itself.

Features:
- Date and time picker for scheduling
- Action type selection
- Responsive design & Accessibility
- Form validation
-->

<script lang="ts">
	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { getModalStore } from '@skeletonlabs/skeleton';

	// Props
	interface Props {
		parent: any;
	}
	let { parent }: Props = $props();

	// --- Component State ---
	const modalStore = getModalStore();
	type ActionType = 'published' | 'unpublished' | 'deleted';

	let scheduleDate: string = $state('');
	let scheduleDateOnly: string = $state('');
	let scheduleTimeOnly: string = $state('');
	// Default to 'published' if no initial action is provided
	let action: ActionType = $state(($modalStore[0]?.meta?.initialAction as ActionType) || 'published');
	let errorMessage: string = $state('');

	// Combine date and time into a single string for validation and submission
	$effect(() => {
		if (scheduleDateOnly && scheduleTimeOnly) {
			scheduleDate = `${scheduleDateOnly}T${scheduleTimeOnly}`;
		} else {
			scheduleDate = '';
		}
	});

	const actionOptions: Array<{ value: ActionType; label: string }> = [
		{ value: 'published', label: m.entrylist_multibutton_publish() },
		{ value: 'unpublished', label: m.entrylist_multibutton_unpublish() },
		{ value: 'deleted', label: m.button_delete() }
	];

	let isFormValid = $derived(scheduleDate !== '');

	/**
	 * Validates the form fields and sets an error message if invalid.
	 */
	function validateForm(): boolean {
		if (!scheduleDate) {
			errorMessage = 'Please select a date and time.';
			return false;
		}
		if (new Date(scheduleDate) < new Date()) {
			errorMessage = 'Scheduled time must be in the future.';
			return false;
		}
		errorMessage = '';
		return true;
	}

	/**
	 * Handles the form submission.
	 * If the form is valid, it passes the data back to the component that opened the modal.
	 */
	function onFormSubmit(event: SubmitEvent): void {
		event.preventDefault();
		handleSubmission();
	}

	// Handles the button click submission
	function onButtonClick(): void {
		handleSubmission();
	}

	//  Common submission logic for both form submit and button click
	function handleSubmission(): void {
		if (!validateForm()) return;

		// The component that opened the modal is responsible for handling this response.
		if ($modalStore[0]?.response) {
			$modalStore[0].response({
				date: scheduleDate,
				action: action // Pass the selected action
			});
		}

		// Close the modal
		modalStore.close();
	}

	// --- Base Classes ---
	const cBase = 'card p-4 w-modal shadow-xl space-y-4 bg-white dark:bg-surface-800';
	const cHeader = 'text-2xl font-bold';
	const cForm = 'border border-surface-500 p-4 space-y-4 rounded-container-token';
</script>

{#if $modalStore[0]}
	<div class="modal-schedule {cBase}" role="dialog" aria-labelledby="schedule-modal-title">
		<header class={`text-center text-primary-500 ${cHeader}`}>
			<h2 id="schedule-modal-title">{$modalStore[0]?.title ?? 'Schedule Action'}</h2>
		</header>
		<article class="text-center text-sm">
			{$modalStore[0]?.body ?? 'Select a date, time, and action to schedule for the selected entries.'}
		</article>

		<form class="modal-form {cForm}" onsubmit={onFormSubmit}>
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<label class="label">
					<span>Schedule Date</span>
					<input
						type="date"
						bind:value={scheduleDateOnly}
						class="input"
						required
						min={new Date().toISOString().split('T')[0]}
						aria-describedby="schedule-date-error"
						onclick={(e) => (e.currentTarget as HTMLInputElement).showPicker()}
					/>
				</label>
				<label class="label">
					<span>Schedule Time</span>
					<input
						type="time"
						bind:value={scheduleTimeOnly}
						class="input"
						required
						aria-describedby="schedule-date-error"
						onclick={(e) => (e.currentTarget as HTMLInputElement).showPicker()}
					/>
				</label>
			</div>

			<label class="label mt-4">
				<span>Action on Scheduled Time</span>
				<select bind:value={action} class="select" required>
					{#each actionOptions as option}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</label>

			{#if errorMessage}
				<p class="text-error-500" id="schedule-date-error" role="alert">{errorMessage}</p>
			{/if}
		</form>

		<footer class="modal-footer {parent.regionFooter}">
			<button type="button" class="btn {parent?.buttonNeutral}" onclick={parent?.onClose} aria-label="Cancel scheduling">
				{m.button_cancel()}
			</button>
			<button type="button" class="btn {parent?.buttonPositive}" onclick={onButtonClick} disabled={!isFormValid} aria-label="Save schedule">
				{m.button_save()}
			</button>
		</footer>
	</div>
{/if}
