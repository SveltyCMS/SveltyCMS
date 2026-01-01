<!--
@file src/components/system/ConfirmDialog.svelte
@component
**ConfirmDialog**
-->

<script lang="ts">
	interface Props {
		body?: string;
		buttonTextConfirm?: string;
		buttonTextCancel?: string;
		close?: (result: boolean) => void;
	}

	const { body = 'Are you sure?', buttonTextConfirm = 'Confirm', buttonTextCancel = 'Cancel', close }: Props = $props();

	function onConfirm() {
		close?.(true);
	}

	function onCancel() {
		close?.(false);
	}
</script>

<div class="space-y-4">
	{#if body}
		<p class="text-surface-600 dark:text-surface-300">{body}</p>
	{/if}

	<div class="flex justify-end gap-2">
		{#if buttonTextCancel}
			<button class="btn hover:bg-surface-500/10 border border-surface-200 dark:border-surface-700" onclick={onCancel}>
				{buttonTextCancel}
			</button>
		{/if}
		<button class="btn variant-filled-primary" onclick={onConfirm}>
			{buttonTextConfirm}
		</button>
	</div>
</div>
