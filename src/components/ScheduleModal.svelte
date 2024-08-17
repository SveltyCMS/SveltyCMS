<script lang="ts">
	import { modifyEntry, selectedEntries, entryData, collection } from '@stores/store';
	import { saveFormData } from '@src/utils/utils';
	import { page } from '$app/stores';

	// Auth
	import type { User } from '@src/auth/types';
	import { authAdapter, dbAdapter } from '@src/databases/db';
	const user: User = $page.data.user;

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { getModalStore } from '@skeletonlabs/skeleton';

	const modalStore = getModalStore();

	// Props
	/** Exposes parent props to this component. */
	export let parent: any;

	let scheduleDate: string = '';
	let action: 'publish' | 'unpublish' | 'delete' | 'schedule' | 'clone' | 'test' =
		($modalStore[0]?.meta?.initialAction as 'publish' | 'unpublish' | 'delete' | 'schedule' | 'clone' | 'test') || 'schedule';

	const actionOptions = [
		{ value: 'publish' as const, label: m.entrylist_multibutton_publish() },
		{ value: 'unpublish' as const, label: m.entrylist_multibutton_unpublish() },
		{ value: 'delete' as const, label: m.button_delete() }
	];

	//Create a custom submit function to pass the response and close the modal.
	async function onFormSubmit(): Promise<void> {
		if (!scheduleDate) return;
		if (!authAdapter || !dbAdapter) {
			console.error('Auth adapter or DB adapter is not initialized');
			return;
		}

		const scheduledTime = new Date(scheduleDate).getTime();

		for (const entryId of $selectedEntries) {
			const entry = $entryData[entryId];
			if (!entry) continue;

			let updateData: any = {
				_id: entryId,
				_scheduled: scheduledTime,
				_scheduledAction: action
			};

			await saveFormData({
				data: updateData,
				_collection: $collection,
				_mode: 'edit',
				id: entryId,
				dbAdapter: dbAdapter,
				authAdapter: authAdapter,
				user_id: user._id,
				user: user
			});
		}

		$modifyEntry(action);

		if ($modalStore[0].response) {
			$modalStore[0].response(true);
		}
		modalStore.close();
	}

	// Base Classes
	const cBase = 'card p-4 w-modal shadow-xl space-y-4 bg-white';
	const cHeader = 'text-2xl font-bold';
	const cForm = 'border border-surface-500 p-4 space-y-4 rounded-container-token';
</script>

<!-- @component This example creates a simple form modal. -->
{#if $modalStore[0]}
	<div class="modal-avatar {cBase}">
		<header class={`text-center text-primary-500 ${cHeader}`}>
			{$modalStore[0]?.title ?? '(title missing)'}
		</header>
		<article class="text-center text-sm">
			{$modalStore[0]?.body ?? '(body missing)'}
		</article>

		<form class="modal-form {cForm}">
			<label class="label">
				<span>Scheduler</span>
				<input type="datetime-local" bind:value={scheduleDate} class="input" required />
			</label>

			<label class="label">
				<span>Type</span>
				<select bind:value={action} class="select">
					{#each actionOptions as option}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</label>
		</form>

		<footer class="modal-footer {parent.regionFooter}">
			<button class="btn {parent.buttonNeutral}" on:click={parent.onClose}>
				{m.button_cancel()}
			</button>
			<button class="btn {parent.buttonPositive}" on:click={onFormSubmit}>{m.button_save()}</button>
		</footer>
	</div>
{/if}
