<!-- 
@file src/components/ScheduleModal.svelte
@component
**ScheduleModal component for scheduling actions on entries**

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
	let { open = $bindable(false) } = $props<{
		open?: boolean;
	}>();
	import { page } from '$app/state';
	import { Modal } from '@skeletonlabs/skeleton-svelte';
	import { modifyEntry, selectedEntries, collectionValue, collection } from '@src/stores/collectionStore.svelte';
	import { saveFormData } from '../utils/data';
	import { createEventDispatcher } from 'svelte';

	// Auth
	import type { User } from '@src/auth/types';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	const user: User = page.data.user;

	type ActionType = 'published' | 'unpublished' | 'deleted' | 'scheduled' | 'cloned' | 'testing';

	let scheduleDate: string = $state('');
	let action: ActionType = $state('scheduled');
	let errorMessage: string = $state('');

	const actionOptions: Array<{ value: ActionType; label: string }> = [
		{ value: 'published', label: m.entrylist_multibutton_publish() },
		{ value: 'unpublished', label: m.entrylist_multibutton_unpublish() },
		{ value: 'deleted', label: m.button_delete() }
	];

	let isFormValid = $derived(scheduleDate !== '' && action !== undefined);

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

		try {
			// If we have selected entries, update them
			if ($selectedEntries && $selectedEntries.length > 0) {
				const scheduledTime = new Date(scheduleDate).getTime();

				for (const entryId of $selectedEntries) {
					const entry = collectionValue.value[entryId];
					if (!entry) continue;

					const updateData = {
						_id: entryId,
						_scheduled: scheduledTime,
						_scheduledAction: action,
						status: 'scheduled'
					};

					// Create a FormData object to match the expected type
					const formData = new FormData();
					Object.entries(updateData).forEach(([key, value]) => {
						formData.append(key, value.toString());
					});

					await saveFormData({
						data: formData,
						_collection: collection.value,
						_mode: 'edit',
						id: entryId,
						user: user
					});
				}

				$modifyEntry(action);
			}
		} catch (error) {
			console.error('Error scheduling entries:', error);
			errorMessage = 'An error occurred while scheduling. Please try again.';
		}
	}

	// Base Classes
	let openState = $state(false);

	function modalClose() {
		openState = false;
	}
</script>

<Modal
	open={openState}
	onOpenChange={(e) => (openState = e.open)}
	triggerBase="btn preset-tonal"
	contentBase="card bg-surface-100-900 p-4 space-y-4 shadow-xl max-w-screen-sm"
	backdropClasses="backdrop-blur-sm"
>
	{#snippet trigger()}
		<button type="button" class="btn preset-tonal" onclick={() => (openState = true)}> Schedule Action </button>
	{/snippet}

	{#snippet content()}
		<header class="flex justify-between">
			<h2 class="h2">Schedule Action</h2>
		</header>
		<article>
			<p class="opacity-60">Select a date, time, and action to schedule for the selected entries.</p>
		</article>

		<form
			onsubmit={(e) => {
				e.preventDefault();
				onFormSubmit();
			}}
			class="space-y-4"
		>
			<label>
				<span class="mb-2 block">Schedule Date and Time</span>
				<input
					type="datetime-local"
					bind:value={scheduleDate}
					class="input w-full"
					required
					min={new Date().toISOString().slice(0, 16)}
					aria-describedby="schedule-date-error"
				/>
			</label>

			<label>
				<span class="mb-2 block">Action Type</span>
				<select bind:value={action} class="select w-full" required>
					{#each actionOptions as option}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</label>

			{#if errorMessage}
				<p class="text-error-500" id="schedule-date-error" role="alert">{errorMessage}</p>
			{/if}

			<div class="flex justify-end gap-4">
				<button type="button" class="btn preset-tonal" onclick={modalClose}>Cancel</button>
				<button type="submit" class="btn preset-filled" disabled={!isFormValid}>Save</button>
			</div>
		</form>
	{/snippet}
</Modal>
