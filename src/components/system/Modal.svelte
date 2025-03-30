<!-- 
@file src/components/system/Modal.svelte
@component 
**Modal component**

@example
<Modal open={isModalOpen} on:close={() => isModalOpen = false}>
	<ModalHeader>Modal Header</ModalHeader>
	<ModalBody>
		<p>Modal Body Content</p>
	</ModalBody>
</Modal>	

### Props:
- `showModal` {boolean} - Whether the modal is open
- `header` {function} - Function to render the modal header
- `children` {function} - Function to render the modal content
- `maxWidth` {string} - Max width of the modal (default: 'max-w-lg')
- `closeOnClickOutside` {boolean} - Whether to close the modal when clicking outside (default: true)

### Features:
- Modal component
- Header
- Children
- Max width
- Close on click outside
-->

<script lang="ts">
	// Define props
	let {
		showModal = $bindable(false),
		header,
		children,
		maxWidth = 'max-w-lg',
		closeOnClickOutside = true
	} = $props<{
		showModal?: boolean;
		header?: () => any;
		children: () => any;
		maxWidth?: string;
		closeOnClickOutside?: boolean;
	}>();

	let dialog: HTMLDialogElement;
	let closeButton: HTMLButtonElement;

	$effect(() => {
		if (showModal && dialog) {
			dialog.showModal();
			closeButton?.focus();
		} else if (!showModal && dialog?.open) {
			dialog.close();
		}
	});

	function handleBackdropClick(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (closeOnClickOutside && target === dialog) {
			showModal = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && closeOnClickOutside) {
			showModal = false;
		}
	}
</script>

<dialog
	bind:this={dialog}
	onclose={() => (showModal = false)}
	onclick={handleBackdropClick}
	onkeydown={handleKeydown}
	class="fixed top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-0 shadow-xl {maxWidth} backdrop:bg-black/30"
	aria-modal="true"
	aria-labelledby="modal-title"
>
	<div class="flex flex-col">
		{#if header}
			<div class="border-b border-gray-200 p-4" id="modal-title">
				{@render header()}
			</div>
		{/if}

		<div class="p-4">
			{@render children()}
		</div>

		<div class="flex justify-end border-t border-gray-200 p-4">
			<button
				bind:this={closeButton}
				onclick={() => (showModal = false)}
				class="rounded-md bg-gray-200 px-4 py-2 font-medium text-gray-800 transition hover:bg-gray-300 focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 focus:outline-none"
				aria-label="Close modal"
			>
				Close
			</button>
		</div>
	</div>
</dialog>

<style>
	dialog {
		border: none;
		padding: 0;
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
	}

	dialog[open] {
		animation: zoom 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	@keyframes zoom {
		from {
			transform: translate(-50%, -50%) scale(0.95);
			opacity: 0;
		}
		to {
			transform: translate(-50%, -50%) scale(1);
			opacity: 1;
		}
	}

	dialog[open]::backdrop {
		animation: fade 0.2s ease-out;
	}

	@keyframes fade {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
</style>
