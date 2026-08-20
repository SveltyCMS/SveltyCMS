<script lang="ts" module>
	/**
	 * Single-instance guard.
	 *
	 * DialogManager renders from the shared global `modalState`, so a second mount renders every
	 * modal twice, pixel-aligned: the top copy intercepts pointer events and the lower copy is
	 * inert but still visible. Mount it ONCE, in src/routes/+layout.svelte.
	 */
	let liveInstances = 0;
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { dev } from '$app/env';
	import Modal from '@components/ui/modal.svelte';
	import { modalState } from '@utils/modal.svelte';
	import { logger } from '@utils/logger';

	onMount(() => {
		liveInstances += 1;
		if (dev && liveInstances > 1) {
			logger.error(
				`[DialogManager] Multiple (${liveInstances}) <DialogManager /> instances are mounted simultaneously. Modals will duplicate. Only the root layout should mount DialogManager.`
			);
		}
		return () => {
			liveInstances = Math.max(0, liveInstances - 1);
		};
	});

	// Bind open state to modalState
	let open = $state(false);

	$effect(() => {
		open = modalState.isOpen;
	});

	$effect(() => {
		// When Modal closes internally (backdrop/escape/close button), sync to store
		if (!open && modalState.isOpen) {
			modalState.close();
		}
	});

	/* Derived state */
	const title = $derived(modalState.active?.props?.title);
	const size = $derived(modalState.active?.props?.size || 'md');
	const modalClasses = $derived(modalState.active?.props?.modalClasses ?? '');
	const dialogClass = $derived(modalState.active?.props?.dialogClass ?? '');
	const contentClass = $derived(modalState.active?.props?.contentClass ?? '');
	const ActiveComponent = $derived(modalState.active?.component);
	const componentProps = $derived.by(() => {
		if (!modalState.active?.props) return {};
		const {
			title: _title,
			size: _size,
			modalClasses: _modalClasses,
			dialogClass: _dialogClass,
			contentClass: _contentClass,
			...rest
		} = modalState.active.props;
		return rest;
	});

	/** Prefer a single close(result) so modal content can return data without a separate response prop. */
	function closeWithResult(result?: unknown) {
		modalState.close(result);
	}
</script>

<Modal bind:open {title} {size} class={modalClasses} {dialogClass} {contentClass}>
	{#if ActiveComponent}
		<div
			class="modal-body min-h-0 overflow-hidden {size === 'fullscreen' || size === 'editor' ? 'flex h-full flex-1 flex-col' : ''}"
		>
			<ActiveComponent
				{...componentProps}
				close={closeWithResult}
				response={modalState.active?.response}
			/>
		</div>
	{/if}
</Modal>
