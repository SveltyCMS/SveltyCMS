<!--
@file src/components/ModalConfirm.svelte
@component
**A confirmation modal for deleting a user**

Prompts the user to confirm deletion with customizable title, body, and button text. Optimized for accessibility and reusability.

### Props
- `user` {object} - User object to delete (required)
- `title` {string} - Modal title (default: 'Confirm Deletion')
- `body` {string} - Modal body text (default: 'Are you sure you want to delete this user?')
- `buttonTextCancel` {string} - Cancel button text (default: 'Cancel')
- `buttonTextConfirm` {string} - Confirm button text (default: 'Delete User')

Features:
- Accessibility and reusability
- Customizable title, body, and button text
-->

<script lang="ts">
	import { invalidateAll } from '$app/navigation';

	import * as m from '@src/paraglide/messages';
	import type { User } from '@src/auth/types';

	// Skeleton
	import { Modal } from '@skeletonlabs/skeleton-svelte';

	// Props
	const {
		user,
		title = m.usermodalconfirmtitle(),
		body = m.usermodalconfirmbody(),
		buttonTextCancel = m.button_cancel(),
		buttonTextConfirm = m.usermodalconfirmdeleteuser()
	} = $props<{
		user: User;
		title?: string;
		body?: string;
		buttonTextCancel?: string;
		buttonTextConfirm?: string;
	}>();

	// Modal state
	let openState = $state(false);

	// Delete handler
	async function deleteUser(): Promise<void> {
		try {
			const res = await fetch(`/api/user/deleteUsers`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify([user])
			});
			if (res.status === 200) {
				await invalidateAll();
				openState = false;
			} else {
				throw new Error('Failed to delete user');
			}
		} catch (error) {
			console.error('Error deleting user:', error);
			// Optionally, add toast notification here for error feedback
		}
	}
</script>

<Modal
	open={openState}
	onOpenChange={(e) => (openState = e.open)}
	triggerBase="btn preset-filled-error"
	contentBase="card bg-surface-100-900 p-4 space-y-4 shadow-xl max-w-screen-sm"
	backdropClasses="backdrop-blur-sm"
>
	{#snippet trigger()}
		<div class="flex items-center gap-2">
			<iconify-icon icon="bi:trash3-fill" color="white" width="18"></iconify-icon>
			<span class="hidden sm:block">{m.button_delete()}</span>
		</div>
	{/snippet}

	{#snippet content()}
		<header class="text-primary-500 text-center text-2xl font-bold">
			{title}
		</header>
		<article class="text-center text-sm">
			{body}
		</article>
		<footer class="flex justify-end gap-4">
			<button type="button" class="btn preset-outline-secondary" onclick={() => (openState = false)}>
				{buttonTextCancel}
			</button>
			<button type="button" class="btn preset-filled-error" onclick={deleteUser}>
				{buttonTextConfirm}
			</button>
		</footer>
	{/snippet}
</Modal>
