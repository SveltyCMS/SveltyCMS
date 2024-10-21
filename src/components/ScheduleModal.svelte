<!-- 
@file src/components/ScheduleModal.svelte
@description ScheduleModal component for scheduling actions on entries
Features:
- Schedule publish, unpublish, delete actions
- Date and time picker for scheduling
- Action type selection
- Responsive design
- Accessibility improvements
- Error handling and validation
- Improved type safety
Usage:
Import and use <ScheduleModal /> in your Svelte application.
Ensure that the necessary stores and utility functions are available.
-->

<script lang="ts">
	import { page } from '$app/stores';
	import { modifyEntry, selectedEntries, collectionValue, collection } from '@stores/collectionStore';
	import { saveFormData } from '@utils/utils';
	// Auth
	import type { User } from '@src/auth/types';
	// ParaglideJS
	import * as m from '@src/paraglide/messages';
	// Skeleton
	import { getModalStore } from '@skeletonlabs/skeleton';

	const modalStore = getModalStore();

	// Props
	/** Exposes parent props to this component. */
	export let parent: any;

	const user: User = $page.data.user;

	type ActionType = 'publish' | 'unpublish' | 'delete' | 'schedule' | 'clone' | 'test';

	let scheduleDate: string = '';
	let action: ActionType = ($modalStore[0]?.meta?.initialAction as ActionType) || 'schedule';
	let errorMessage: string = '';

	const actionOptions: Array<{ value: ActionType; label: string }> = [
		{ value: 'publish', label: m.entrylist_multibutton_publish() },
		{ value: 'unpublish', label: m.entrylist_multibutton_unpublish() },
		{ value: 'delete', label: m.button_delete() }
	];

	$: isFormValid = scheduleDate !== '' && action !== undefined;

	function validateForm(): boolean {
		if (!scheduleDate) {
			errorMessage = 'Please select a date and time';
			return false;
		}
		if (new Date(scheduleDate) < new Date()) {
			errorMessage = 'Scheduled time must be in the future';
			return false;
		}
		errorMessage = '';
		return true;
	}

	async function onFormSubmit(): Promise<void> {
		if (!validateForm()) return;

		const scheduledTime = new Date(scheduleDate).getTime();

		try {
			for (const entryId of $selectedEntries) {
				const entry = $collectionValue[entryId];
				if (!entry) continue;

				const updateData = {
					_id: entryId,
					_scheduled: scheduledTime,
					_scheduledAction: action
				};

				// Create a FormData object to match the expected type
				const formData = new FormData();
				Object.entries(updateData).forEach(([key, value]) => {
					formData.append(key, value.toString());
				});

				await saveFormData({
					data: formData,
					_collection: $collection,
					_mode: 'edit',
					id: entryId,
					user: user
				});
			}

			$modifyEntry(action);

			if ($modalStore[0].response) {
				$modalStore[0].response(true);
			}
			modalStore.close();
		} catch (error) {
			console.error('Error scheduling entries:', error);
			errorMessage = 'An error occurred while scheduling. Please try again.';
		}
	}

	// Base Classes
	const cBase = 'card p-4 w-modal shadow-xl space-y-4 bg-white';
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

		<form class="modal-form {cForm}" on:submit|preventDefault={onFormSubmit}>
			<label class="label">
				<span>Schedule Date and Time</span>
				<input type="datetime-local" bind:value={scheduleDate} class="input" required aria-describedby="schedule-date-error" />
			</label>

			<label class="label">
				<span>Action Type</span>
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
			<button type="button" class="btn {parent?.buttonNeutral}" on:click={parent?.onClose} aria-label="Cancel scheduling">
				{m.button_cancel()}
			</button>
			<button type="submit" class="btn {parent?.buttonPositive}" on:click={onFormSubmit} disabled={!isFormValid} aria-label="Save schedule">
				{m.button_save()}
			</button>
		</footer>
	</div>
{/if}
