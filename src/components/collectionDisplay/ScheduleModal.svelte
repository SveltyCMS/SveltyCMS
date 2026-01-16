<!-- 
@file src/components/ScheduleModal.svelte
@component
**ScheduleModal component for scheduling actions on entries**

This is a "dumb" UI component. Its only responsibility is to collect a date,
time, and action from the user and return it via the close callback.

### Features:
- Date and time picker for scheduling
- Action type selection
- Responsive design & Accessibility
- Form validation
-->

<script lang="ts">
	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Props
	interface Props {
		initialAction?: 'publish' | 'unpublish' | 'delete';
		close?: (result?: { date: Date; action: string }) => void;
	}
	const { initialAction = 'publish', close }: Props = $props();

	// --- Component State ---
	type ActionType = 'publish' | 'unpublish' | 'delete';

	let scheduleDateOnly = $state('');
	let scheduleTimeOnly = $state('');
	// svelte-ignore state_referenced_locally
	let action: ActionType = $state(initialAction);
	let errorMessage = $state('');

	const scheduleDate = $derived(`${scheduleDateOnly}T${scheduleTimeOnly}`);
	const isFormValid = $derived(scheduleDateOnly !== '' && scheduleTimeOnly !== '');

	const actionOptions: Array<{ value: ActionType; label: string }> = [
		{ value: 'publish', label: m.entrylist_multibutton_publish() },
		{ value: 'unpublish', label: m.entrylist_multibutton_unpublish() },
		{ value: 'delete', label: m.button_delete() }
	];

	/**
	 * Validates the form fields and sets an error message if invalid.
	 */
	function validateForm(): boolean {
		if (!isFormValid) {
			errorMessage = 'Date and time are required';
			return false;
		}
		if (new Date(scheduleDate) < new Date()) {
			errorMessage = 'Please select a future date and time';
			return false;
		}
		errorMessage = '';
		return true;
	}

	/**
	 * Handles the form submission.
	 */
	function handleSubmission(): void {
		if (!validateForm()) return;
		close?.({ date: new Date(scheduleDate), action });
	}

	// --- Base Classes ---
	const cBase = 'card p-4 w-modal shadow-xl space-y-4 bg-white dark:bg-surface-800';
	const cHeader = 'text-2xl font-bold';
	const cForm = 'border border-surface-500 p-4 space-y-4 rounded-xl';
</script>

<div class="modal-schedule space-y-4 text-black dark:text-white" role="dialog" aria-labelledby="schedule-modal-title">
	<article class="text-center text-sm">{m.scheduler_body?.({ name: '' }) || 'Set a date and time to publish this entry.'}</article>

	<form
		class="modal-form space-y-4"
		onsubmit={(e) => {
			e.preventDefault();
			handleSubmission();
		}}
	>
		<!-- Date and Time Inputs -->
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
			<label class="label">
				<span>Date</span>
				<input class="input" type="date" bind:value={scheduleDateOnly} required aria-label="Date" />
			</label>
			<label class="label">
				<span>Time</span>
				<input class="input" type="time" bind:value={scheduleTimeOnly} required aria-label="Time" />
			</label>
		</div>

		<!-- Action Select -->
		<label class="label">
			<span>Action</span>
			<select class="select" bind:value={action} aria-label="Action">
				{#each actionOptions as opt}
					<option value={opt.value}>{opt.label}</option>
				{/each}
			</select>
		</label>

		<!-- Error Message -->
		{#if errorMessage}
			<div class="text-sm text-error-500" role="alert">{errorMessage}</div>
		{/if}

		<footer class="modal-footer flex items-center justify-end space-x-4 pt-4 border-t border-surface-500/20">
			<button type="button" class="btn preset-ghost" onclick={() => close?.()}>{m.button_cancel()}</button>
			<button type="submit" class="btn preset-filled-primary-500" disabled={!isFormValid}>{m.entrylist_multibutton_schedule()}</button>
		</footer>
	</form>
</div>
