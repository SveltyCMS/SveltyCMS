<!--
@file src/components/system/confirm-dialog.svelte
@component
**ConfirmDialog — shared yes/no dialog for admin actions**

### Features:
- Reads the `meta.buttonConfirmClasses` the modal manager builds
  (`utils/modal.svelte.ts` → `preset-filled-<color>-500`) and maps it onto the
  matching Button variant, so a delete confirmation renders a destructive
  button instead of the same blue/neutral confirm as every other dialog (SV-026).
- Cancel stays a soft neutral so it never competes with the confirm action.
- Title/body are sanitized through `Sanitize profile="strict"`.
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import Sanitize from '@src/utils/sanitize.svelte';

	type ConfirmVariant =
		| 'primary'
		| 'secondary'
		| 'tertiary'
		| 'surface'
		| 'success'
		| 'warning'
		| 'error'
		| 'danger';

	interface Props {
		body?: string;
		buttonTextCancel?: string;
		buttonTextConfirm?: string;
		close?: (result: boolean) => void;
		htmlTitle?: string;
		/**
		 * Presentation hints from `modalState.showConfirm()`. Only
		 * `buttonConfirmClasses` / `buttonCancelClasses` are consumed; the manager
		 * always produced them but nothing read them (SV-026).
		 */
		meta?: { buttonConfirmClasses?: string; buttonCancelClasses?: string };
	}

	const {
		htmlTitle,
		body = 'Are you sure?',
		buttonTextConfirm = 'Confirm',
		buttonTextCancel = 'Cancel',
		meta,
		close
	}: Props = $props();

	/**
	 * `DEFAULT_THEMES.delete` is `{ variant: 'filled', color: 'error' }`, so the
	 * manager hands us `preset-filled-error-500`; archive is warning, publish
	 * success, everything else primary. Map the accent-500 token in the class
	 * string onto a Button variant — an unknown/absent hint falls back to the
	 * neutral `primary` accent.
	 */
	const confirmVariant = $derived.by((): ConfirmVariant => {
		const classes = meta?.buttonConfirmClasses ?? '';
		if (classes.includes('-error') || classes.includes('-danger')) return 'danger';
		if (classes.includes('-warning')) return 'warning';
		if (classes.includes('-success')) return 'success';
		if (classes.includes('-tertiary')) return 'tertiary';
		if (classes.includes('-secondary')) return 'secondary';
		if (classes.includes('-surface')) return 'surface';
		return 'primary';
	});

	function onConfirm() {
		close?.(true);
	}

	function onCancel() {
		close?.(false);
	}
</script>

<div class="space-y-4">
	{#if htmlTitle}
		<h3 class="h3 font-bold text-center"><Sanitize html={htmlTitle} profile="strict" /></h3>
	{/if}
	{#if body}
		<p class="text-surface-600 dark:text-surface-50 text-center">
			<Sanitize html={body} profile="strict" />
		</p>
	{/if}

	<div class="flex justify-between gap-4 pt-4">
		{#if buttonTextCancel}
			<Button variant="tertiary" onclick={onCancel} class="font-medium" data-testid="modal-cancel">
				{buttonTextCancel}
			</Button>
		{/if}
		<Button variant={confirmVariant} onclick={onConfirm} data-testid="modal-confirm">
			{buttonTextConfirm}
		</Button>
	</div>
</div>
