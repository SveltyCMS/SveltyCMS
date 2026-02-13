<!--
@file src/components/system/ConfirmDialog.svelte
@component
**ConfirmDialog**
-->

<script lang="ts">
	import Sanitize from '@src/utils/Sanitize.svelte';

	interface Props {
		htmlTitle?: string;
		body?: string;
		buttonTextConfirm?: string;
		buttonTextCancel?: string;
		close?: (result: boolean) => void;
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
			<button class="btn preset-filled-secondary-500 hover:bg-surface-300 dark:hover:bg-surface-700 font-medium transition-colors" onclick={onCancel}>
				{buttonTextCancel}
			</button>
		{/if}
		<button class="btn preset-filled-primary-500" onclick={onConfirm}>
			{buttonTextConfirm}
		</button>
	</div>
</div>
