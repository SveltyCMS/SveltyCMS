<!--
@file src/components/system/confirm-dialog.svelte
@component
**ConfirmDialog**
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import Sanitize from '@src/utils/sanitize.svelte';

	interface Props {
		body?: string;
		buttonTextCancel?: string;
		buttonTextConfirm?: string;
		close?: (result: boolean) => void;
		htmlTitle?: string;
	}

	const { htmlTitle, body = 'Are you sure?', buttonTextConfirm = 'Confirm', buttonTextCancel = 'Cancel', close }: Props = $props();

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
		<p class="text-surface-600 dark:text-surface-50 text-center"><Sanitize html={body} profile="strict" /></p>
	{/if}

	<div class="flex justify-between gap-4 pt-4">
		{#if buttonTextCancel}
			<Button variant="secondary" onclick={onCancel} class="hover:bg-surface-300 dark:hover:bg-surface-700 font-medium">
				{buttonTextCancel}
			</Button>
		{/if}
		<Button variant="tertiary" onclick={onConfirm} class="dark:">{buttonTextConfirm}</Button>
	</div>
</div>
