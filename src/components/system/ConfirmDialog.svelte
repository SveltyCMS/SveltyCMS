<!--
@file src/components/system/ConfirmDialog.svelte
@component
**ConfirmDialog**
-->

<script lang="ts">
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
		<h3 class="h3 font-bold text-center">{@html htmlTitle}</h3>
	{/if}
	{#if body}
		<p class="text-surface-600 dark:text-surface-300 text-center">{@html body}</p>
	{/if}

	<div class="flex justify-between gap-4 pt-4">
		{#if buttonTextCancel}
			<button class="btn hover:bg-surface-500/10 border border-surface-200 dark:text-surface-50" onclick={onCancel}>
				{buttonTextCancel}
			</button>
		{/if}
		<button class="btn preset-filled-primary-500" onclick={onConfirm}>
			{buttonTextConfirm}
		</button>
	</div>
</div>
