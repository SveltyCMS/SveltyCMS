<!-- 
@file shared/components/src/collectionDisplay/ScheduleModal.svelte
@component
**ScheduleModal component for scheduling future actions (publish/unpublish/delete) on entries.**

### Features:
- **DateTime Selection**: Integrated date and time inputs for precise scheduling.
- **Action Selection**: Choose between publishing, unpublishing, or deleting at the scheduled time.
- **Validation**: Enforces future-dated scheduling and required fields.
- **Dialog System**: Integrated with the custom `modalState` and `modalUtils`.

### Props
- `initialAction` (String): The default action to pre-select ('publish', 'unpublish', 'delete').

### Interaction
- Returns `{ confirmed: true, date: Date, action: String }` on success.
- Returns `undefined` on cancel.
-->

<script lang="ts">
	// Force recompile
	// ParaglideJS
	import * as m from '$lib/paraglide/messages.js';

	// Skeleton
	import { modalState } from '@shared/utils/modalState.svelte';

	// No Props needed

	// --- Component State ---
	// --- Component State ---
	// Removed modalStore

	type ActionType = 'publish' | 'unpublish' | 'delete';

	let scheduleDateOnly = $state('');
	let scheduleTimeOnly = $state('');
	// Access meta prop through modalState.active
	let action: ActionType = $state((modalState.active?.props?.meta?.initialAction as ActionType) || 'publish');
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
	 * If the form is valid, it passes the data back to the component that opened the modal.
	 */
	function handleSubmission(): void {
		if (!validateForm()) return;

		// Pass data back via modalState.close(), which calls the response callback
		modalState.close({
			confirmed: true,
			date: new Date(scheduleDate),
			action: action
		});
	}

	// --- Base Classes ---
	const cBase = 'card p-4 w-modal shadow-xl space-y-4 bg-white dark:bg-surface-800';
	const cHeader = 'text-2xl font-bold';
	const cForm = 'border border-surface-500 p-4 space-y-4 rounded-container-token';
</script>

{#if modalState.active}
	<div class="modal-schedule {cBase}" role="dialog" aria-labelledby="schedule-modal-title">
		<header id="schedule-modal-title" class={`text-center text-primary-500 ${cHeader}`}>Schedule Entry</header>
		<article class="text-center text-sm">Set a date and time to publish this entry.</article>

		<form
			class="modal-form {cForm}"
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
		</form>

		<footer class="modal-footer flex items-center justify-end space-x-4">
			<button class="btn preset-outlined-secondary-500" onclick={() => modalState.close()}>{m.button_cancel()}</button>
			<button class="btn preset-filled-primary-500" onclick={() => handleSubmission()} disabled={!isFormValid}
				>{m.entrylist_multibutton_schedule()}</button
			>
		</footer>
	</div>
{/if}
