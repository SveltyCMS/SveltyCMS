<!--
@file src/components/ModalConfirm.svelte
@component
**A confirmation modal for deleting a user**

Prompts the user to confirm deletion with customizable title, body, and button text. Optimized for accessibility and reusability.

### Props
- `title` {string} - Modal title (default: 'Confirm Deletion')
- `body` {string} - Modal body text (default: 'Are you sure you want to delete this user?')
- `buttonTextCancel` {string} - Cancel button text (default: 'Cancel')
- `buttonTextConfirm` {string} - Confirm button text (default: 'Delete User')

Features:
- Accessibility and reusability
- Customizable title, body, and button text
-->

<script lang="ts">
	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Modals
	import { Modal } from '@skeletonlabs/skeleton-svelte';

	// Props
	interface Props {
		open?: boolean; // Make open bindable
		title?: string;
		body?: string;
		buttonTextCancel?: string;
		buttonTextConfirm?: string;
		onConfirm: () => void; // Callback for confirmation
		onClose: () => void; // Callback for closing
	}

	const {
		open = $bindable(), // Use $bindable
		title = 'Confirm Action', // Generic default title
		body = 'Are you sure you want to proceed?', // Generic default body
		buttonTextCancel = m.button_cancel(),
		buttonTextConfirm = 'Confirm', // Generic confirm text
		onConfirm,
		onClose
	}: Props = $props();
</script>

<Modal
	{open}
	onOpenChange={(e) => {
		if (!e.open) {
			onClose(); // Call onClose if closed externally
		}
	}}
	contentBase="card bg-surface-100-900 p-4 space-y-4 shadow-xl max-w-screen-sm rounded-lg"
	backdropClasses="backdrop-blur-sm"
	triggerBase=""
>
	{#snippet content()}
		<header class="text-primary-500 text-center text-2xl font-bold">
			{title}
		</header>
		<article class="text-center text-sm">
			{body}
		</article>
		<footer class="flex justify-end gap-4">
			<button type="button" class="btn preset-outline-secondary" onclick={onClose}>
				<!-- Call onClose -->
				{buttonTextCancel}
			</button>
			<button type="button" class="btn preset-filled-error" onclick={onConfirm}>
				<!-- Call onConfirm -->
				{buttonTextConfirm}
			</button>
		</footer>
	{/snippet}
</Modal>
