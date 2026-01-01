<!-- 
 @file src/components/ModalPrompt.svelte
 @component 
 **ModalPrompt component**
 @example
 <ModalPrompt title="Prompt" body="Are you sure?" value="" type="text" response={(value) => console.log(value)} parent={modalState} /> 

 ### Features
 - Modal prompt with title, body, and input field
 - Input field can be of type text, number, or email
 - Modal has a confirm and cancel button
 - Modal can be closed by clicking the cancel button or by submitting the form
 -->

<script lang="ts">
	let {
		body = '',
		value = '',
		type = 'text',
		// The close function is passed down automatically by DialogManager
		close
	}: {
		body?: string;
		value?: string;
		type?: string;
		close?: (result: any) => void;
	} = $props();

	// svelte-ignore state_referenced_locally
	let inputValue = $state(value);

	function onConfirm() {
		close?.(inputValue);
	}

	function onCancel() {
		close?.(null); // Return null or false to indicate cancellation
	}
</script>

<div class="space-y-4">
	{#if body}
		<article class="text-sm opacity-80">
			{@html body}
		</article>
	{/if}

	<form
		class="flex flex-col gap-2"
		onsubmit={(e) => {
			e.preventDefault();
			onConfirm();
		}}
	>
		<input class="input p-2 border rounded-container-token bg-surface-200-800" {type} bind:value={inputValue} autofocus />
	</form>

	<div class="flex justify-end gap-2 pt-2">
		<button type="button" class="btn preset-tonal" onclick={onCancel}> Cancel </button>
		<button type="button" class="btn preset-filled-primary" onclick={onConfirm}> Confirm </button>
	</div>
</div>
