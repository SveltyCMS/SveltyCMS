<!--
@file src/widgets/richText/components/VideoDialog.svelte
@component
**VideoDialog for richText editor**

@props show - boolean
@props editor - Editor

-->

<script lang="ts">
	import FloatingInput from '@components/system/inputs/floatingInput.svelte';
	import type { Editor } from '@tiptap/core';
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';

	interface Props {
		show?: boolean;
		editor: Editor | null;
	}

	let { show = $bindable(false), editor }: Props = $props();

	let insert_url = $state(false);
	let youtube_url = $state('');

	function close() {
		show = false;
		// Reset state after a short delay to allow the fade-out transition to complete
		setTimeout(() => {
			youtube_url = '';
			insert_url = false;
		}, 200);
	}

	function handleSubmit(e: Event) {
		e.preventDefault();

		// SECURITY: Validate YouTube URL to prevent XSS
		// Only allow youtube.com and youtu.be URLs (HTTPS only)
		const youtubePattern = /^https:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

		if (youtube_url && editor) {
			if (youtubePattern.test(youtube_url)) {
				editor.chain().focus().setYoutubeVideo({ src: youtube_url }).run();
				close();
			} else {
				alert('Invalid YouTube URL. Please use a valid youtube.com or youtu.be link.');
			}
		} else {
			close();
		}
	}

	// Add 'Escape' key listener
	onMount(() => {
		const handleKeydown = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && show) {
				close();
			}
		};
		window.addEventListener('keydown', handleKeydown);
		return () => {
			window.removeEventListener('keydown', handleKeydown);
		};
	});
</script>

{#if show}
	<div transition:fade={{ duration: 150 }} class="fixed inset-0 z-40 bg-black/30" onclick={close} role="presentation"></div>

	<div
		transition:fade={{ duration: 150 }}
		role="dialog"
		aria-modal="true"
		aria-labelledby="video-dialog-title"
		class="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 transform rounded-lg bg-white p-6 shadow-xl"
	>
		<iconify-icon
			icon="material-symbols:close"
			width="24"
			role="button"
			aria-label="Close"
			class="absolute right-3 top-3 z-10 cursor-pointer text-gray-500 hover:text-gray-800"
			onclick={close}
			onkeydown={(e: KeyboardEvent) => e.key === 'Enter' && close()}
			tabindex="0"
		></iconify-icon>

		<h3 id="video-dialog-title" class="mb-4 text-lg font-medium">Add Video</h3>

		{#if insert_url}
			<form onsubmit={handleSubmit} class="relative mt-2 flex flex-col items-center justify-center gap-4">
				<FloatingInput bind:value={youtube_url} autofocus={true} textColor="black" name="Youtube URL" label="Youtube URL" />
				<button type="submit" class="preset-filled-primary-500 btn w-full">Add Video</button>
			</form>
		{:else}
			<div class="relative mt-2 flex flex-col items-center justify-center gap-4">
				<p class="text-sm text-gray-500">Video upload is not yet implemented.</p>
				<p>or</p>
				<div class="flex w-full justify-center gap-2">
					<button class="preset-outlined-primary-500 btn w-full" disabled>Browse locally</button>
					<button class="preset-filled-secondary-500 btn w-full" onclick={() => (insert_url = true)}> YouTube </button>
				</div>
			</div>
		{/if}
	</div>
{/if}
